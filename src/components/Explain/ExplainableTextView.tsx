import { listen } from "@tauri-apps/api/event";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { addCustomFlashcard, explainText, generateLlmResponse } from "../../lib/tauriApi";
import {
  PERSONALIZATION_LEVELS,
  type ExplainHistoryEntry,
  type ExplainStreamEvent,
} from "../../lib/types";
import { useSettingsStore, useToastStore } from "../../stores";
import ExplainPanel from "./ExplainPanel";
import TextSelectionToolbar from "./TextSelectionToolbar";

type PersonalizationLevel = (typeof PERSONALIZATION_LEVELS)[number]["value"];

const FALLBACK_LEVEL: PersonalizationLevel = "undergraduate_2nd_year";
const PERSONALIZATION_ORDER: PersonalizationLevel[] = PERSONALIZATION_LEVELS.map(
  (item) => item.value,
);
const MAX_CONTEXT_CHARS = 1200;
const CONTEXT_SELECTOR =
  "[data-selection-context], p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6";

interface SelectionSnapshot {
  text: string;
  context: string;
  position: {
    left: number;
    top: number;
  };
}

interface ExplainableTextViewProps {
  lectureId: string | null;
  children: ReactNode;
  className?: string;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveLevel(level: string | undefined): PersonalizationLevel {
  if (!level) {
    return FALLBACK_LEVEL;
  }

  const normalized = PERSONALIZATION_ORDER.find((value) => value === level);
  return normalized ?? FALLBACK_LEVEL;
}

function getAdjacentLevel(level: string, delta: -1 | 1): PersonalizationLevel | null {
  const currentIndex = PERSONALIZATION_ORDER.indexOf(resolveLevel(level));
  if (currentIndex < 0) {
    return null;
  }

  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= PERSONALIZATION_ORDER.length) {
    return null;
  }

  return PERSONALIZATION_ORDER[nextIndex] ?? null;
}

function toElement(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  if (node instanceof Element) {
    return node;
  }
  return node.parentElement;
}

function contextFromRange(range: Range, selectedText: string): string {
  const element = toElement(range.commonAncestorContainer);
  if (!element) {
    return selectedText;
  }

  const contextElement = element.closest(CONTEXT_SELECTOR);
  const raw = (contextElement?.textContent ?? selectedText).replace(/\s+/g, " ").trim();
  if (raw.length <= MAX_CONTEXT_CHARS) {
    return raw;
  }

  return `${raw.slice(0, MAX_CONTEXT_CHARS)}…`;
}

function clampToolbarPosition(left: number, top: number): { left: number; top: number } {
  return {
    left: Math.max(16, Math.min(window.innerWidth - 16, left)),
    top: Math.max(16, Math.min(window.innerHeight - 16, top)),
  };
}

function readSelectionSnapshot(
  container: HTMLDivElement | null,
  anchoredAt?: { left: number; top: number },
): SelectionSnapshot | null {
  const selectionApi = window.getSelection();
  if (!selectionApi || selectionApi.isCollapsed || selectionApi.rangeCount === 0) {
    return null;
  }

  const text = selectionApi.toString().trim();
  if (!text) {
    return null;
  }

  const range = selectionApi.getRangeAt(0);
  const ancestorElement = toElement(range.commonAncestorContainer);
  if (!container || !ancestorElement || !container.contains(ancestorElement)) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  const selectionPosition = (() => {
    if (anchoredAt) {
      return clampToolbarPosition(anchoredAt.left, anchoredAt.top);
    }

    const aboveTop = rect.top - 10;
    const fallbackBelow = rect.bottom + 10;
    const desiredTop = aboveTop < 28 ? fallbackBelow : aboveTop;
    return clampToolbarPosition(rect.left + rect.width / 2, desiredTop);
  })();

  return {
    text,
    context: contextFromRange(range, text),
    position: selectionPosition,
  };
}

function buildFlashcardBackPrompt(front: string, context: string, level: string): string {
  const readableLevel =
    PERSONALIZATION_LEVELS.find((item) => item.value === level)?.label.toLowerCase() ??
    "university";

  return `You are creating one study flashcard for a ${readableLevel} learner.

Write the back side for this flashcard front.
Keep it accurate and concise (1-3 sentences).
Output plain text only.

Front:
${front}

Context:
${context || "No extra context provided."}`;
}

export default function ExplainableTextView({
  lectureId,
  children,
  className,
}: ExplainableTextViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeExplainIdRef = useRef<string | null>(null);
  const pushToast = useToastStore((state) => state.pushToast);
  const settings = useSettingsStore((state) => state.settings);

  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [history, setHistory] = useState<ExplainHistoryEntry[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isAddingFlashcard, setIsAddingFlashcard] = useState(false);

  const isBusy = isExplaining || isAddingFlashcard;
  const latestEntry = history[history.length - 1] ?? null;

  const captureSelection = useCallback(() => {
    const snapshot = readSelectionSnapshot(containerRef.current);
    setSelection(snapshot);
  }, []);

  useEffect(() => {
    let rafId = 0;

    const scheduleCapture = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(captureSelection);
    };

    document.addEventListener("mouseup", scheduleCapture, true);
    document.addEventListener("keyup", scheduleCapture, true);
    document.addEventListener("selectionchange", scheduleCapture, true);
    window.addEventListener("scroll", scheduleCapture, true);
    window.addEventListener("resize", scheduleCapture);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener("mouseup", scheduleCapture, true);
      document.removeEventListener("keyup", scheduleCapture, true);
      document.removeEventListener("selectionchange", scheduleCapture, true);
      window.removeEventListener("scroll", scheduleCapture, true);
      window.removeEventListener("resize", scheduleCapture);
    };
  }, [captureSelection]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void listen<ExplainStreamEvent>("explain-stream", (event) => {
      const requestId = activeExplainIdRef.current;
      if (!requestId) {
        return;
      }

      const { token, done } = event.payload;
      setHistory((previous) =>
        previous.map((entry) =>
          entry.id === requestId
            ? {
                ...entry,
                explanation: `${entry.explanation}${token}`,
                isStreaming: !done,
              }
            : entry,
        ),
      );
    }).then((fn) => {
      if (!active) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const startExplanation = useCallback(
    async (override?: { text: string; context: string; level: string }) => {
      const source = override ?? {
        text: selection?.text ?? "",
        context: selection?.context ?? "",
        level: resolveLevel(settings?.personalization_level),
      };

      const text = source.text.trim();
      if (!text) {
        pushToast({
          kind: "warning",
          message: "Select text first to generate an explanation.",
        });
        return;
      }

      if (isExplaining) {
        return;
      }

      const requestId = createId();
      const level = resolveLevel(source.level);
      activeExplainIdRef.current = requestId;
      setIsExplaining(true);
      setIsPanelOpen(true);
      setSelection(null);

      setHistory((previous) => [
        ...previous,
        {
          id: requestId,
          selectedText: text,
          context: source.context,
          explanation: "",
          level,
          createdAt: Date.now(),
          isStreaming: true,
        },
      ]);

      try {
        const explanation = await explainText(text, source.context, level);
        setHistory((previous) =>
          previous.map((entry) =>
            entry.id === requestId
              ? { ...entry, explanation: explanation.trim(), isStreaming: false }
              : entry,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setHistory((previous) =>
          previous.map((entry) =>
            entry.id === requestId
              ? { ...entry, error: message, isStreaming: false }
              : entry,
          ),
        );
        pushToast({
          kind: "error",
          message: "Unable to generate explanation.",
        });
      } finally {
        activeExplainIdRef.current = null;
        setIsExplaining(false);
      }
    },
    [isExplaining, pushToast, selection?.context, selection?.text, settings?.personalization_level],
  );

  const handleCopy = useCallback(async () => {
    if (!selection?.text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selection.text);
      pushToast({
        kind: "success",
        message: "Copied selected text to clipboard.",
      });
      setSelection(null);
    } catch {
      pushToast({
        kind: "error",
        message: "Unable to copy selected text.",
      });
    }
  }, [pushToast, selection?.text]);

  const handleAddToFlashcards = useCallback(async () => {
    if (!selection?.text) {
      return;
    }
    if (!lectureId) {
      pushToast({
        kind: "warning",
        message: "Select a knowte before adding flashcards.",
      });
      return;
    }
    if (isAddingFlashcard) {
      return;
    }

    const level = resolveLevel(settings?.personalization_level);
    const prompt = buildFlashcardBackPrompt(selection.text, selection.context, level);
    setIsAddingFlashcard(true);

    try {
      const back = (
        await generateLlmResponse(
          lectureId,
          "custom_flashcard_back",
          "",
          prompt,
          false,
        )
      ).trim();

      if (!back) {
        throw new Error("The model returned an empty flashcard answer.");
      }

      await addCustomFlashcard(lectureId, selection.text, back);
      pushToast({
        kind: "success",
        message: "Added custom flashcard from selected text.",
      });
      setSelection(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pushToast({
        kind: "error",
        message: message || "Unable to add flashcard.",
      });
    } finally {
      setIsAddingFlashcard(false);
    }
  }, [
    isAddingFlashcard,
    lectureId,
    pushToast,
    selection?.context,
    selection?.text,
    settings?.personalization_level,
  ]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isBusy) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, [contenteditable='true']")
      ) {
        return;
      }
      if (!containerRef.current?.contains(event.target as Node)) {
        return;
      }

      const snapshot = readSelectionSnapshot(containerRef.current, {
        left: event.clientX,
        top: event.clientY - 8,
      });
      if (!snapshot) {
        return;
      }

      event.preventDefault();
      setSelection(snapshot);
    },
    [isBusy],
  );

  const simplerLevel = useMemo(
    () => (latestEntry ? getAdjacentLevel(latestEntry.level, -1) : null),
    [latestEntry],
  );
  const deeperLevel = useMemo(
    () => (latestEntry ? getAdjacentLevel(latestEntry.level, 1) : null),
    [latestEntry],
  );

  const handleExplainSimpler = useCallback(() => {
    if (!latestEntry || !simplerLevel) {
      return;
    }

    void startExplanation({
      text: latestEntry.selectedText,
      context: latestEntry.context,
      level: simplerLevel,
    });
  }, [latestEntry, simplerLevel, startExplanation]);

  const handleExplainDeeper = useCallback(() => {
    if (!latestEntry || !deeperLevel) {
      return;
    }

    void startExplanation({
      text: latestEntry.selectedText,
      context: latestEntry.context,
      level: deeperLevel,
    });
  }, [deeperLevel, latestEntry, startExplanation]);

  const overlays = (
    <>
      <TextSelectionToolbar
        isVisible={Boolean(selection)}
        position={selection?.position ?? null}
        onExplain={() => void startExplanation()}
        onAddToFlashcards={() => void handleAddToFlashcards()}
        onCopy={() => void handleCopy()}
        disableActions={isBusy}
      />

      <ExplainPanel
        isOpen={isPanelOpen}
        history={history}
        canExplainSimpler={Boolean(simplerLevel)}
        canExplainDeeper={Boolean(deeperLevel)}
        isBusy={isBusy}
        onExplainSimpler={handleExplainSimpler}
        onExplainDeeper={handleExplainDeeper}
        onClose={() => setIsPanelOpen(false)}
      />

      {!isPanelOpen && history.length > 0 && (
        <button
          type="button"
          onClick={() => setIsPanelOpen(true)}
          className="print:hidden fixed right-0 top-1/2 z-[60] -translate-y-1/2 rounded-l-lg border border-[var(--border-default)]/90 bg-[var(--bg-surface-overlay)]/95 px-2 py-2 text-[11px] font-medium text-[var(--text-secondary)] shadow-lg transition-colors hover:bg-[var(--bg-elevated)]"
        >
          Explain Panel
        </button>
      )}
    </>
  );

  return (
    <div ref={containerRef} className={className} onContextMenu={handleContextMenu}>
      {children}
      {typeof document !== "undefined" ? createPortal(overlays, document.body) : overlays}
    </div>
  );
}
