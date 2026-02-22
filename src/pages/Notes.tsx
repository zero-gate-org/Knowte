import { useCallback, useEffect, useState } from "react";
import { ExplainableTextView } from "../components";
import { NotesSkeleton } from "../components/Skeletons";
import { NotesExport, StructuredNotesView } from "../components/Notes";
import { ViewHeader } from "../components/Layout";
import { getNotes, regenerateNotes } from "../lib/tauriApi";
import type { StructuredNotes } from "../lib/types";
import { useLectureStore, useToastStore, useUiStore } from "../stores";

// ─── Table of Contents ────────────────────────────────────────────────────────

interface TocItem {
  id: string;
  label: string;
  level: "h1" | "h2";
}

function buildToc(notes: StructuredNotes, hasSummary: boolean): TocItem[] {
  const items: TocItem[] = [];

  if (hasSummary) {
    items.push({ id: "summary", label: "Summary", level: "h2" });
  }

  (notes.topics ?? []).forEach((topic, i) => {
    items.push({ id: `topic-${i}`, label: topic.heading, level: "h2" });
  });

  if ((notes.key_terms ?? []).length > 0) {
    items.push({ id: "key-terms", label: "Key Terms", level: "h2" });
  }

  if ((notes.takeaways ?? []).length > 0) {
    items.push({ id: "takeaways", label: "Key Takeaways", level: "h2" });
  }

  return items;
}

interface TableOfContentsProps {
  items: TocItem[];
  activeId: string | null;
}

function TableOfContents({ items, activeId }: TableOfContentsProps) {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
        Contents
      </p>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className={`block w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            activeId === item.id
              ? "text-[var(--accent-primary)] bg-[var(--accent-glow)] font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          } ${item.level === "h2" ? "pl-3" : "pl-5"}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Active section tracker ───────────────────────────────────────────────────

function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) return;

    const observers = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveId(id);
          }
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
      );
      observer.observe(el);
      return observer;
    });

    return () => {
      observers.forEach((o) => o?.disconnect());
    };
  }, [ids]);

  return activeId;
}

// ─── Empty / Loading States ───────────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-lecture" | "no-notes" }) {
  if (reason === "no-lecture") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-2">
        <span className="text-4xl">📝</span>
        <p className="text-sm">No knowte selected.</p>
        <p className="text-xs">Add and process a knowte to view notes.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-2">
      <span className="text-4xl">📝</span>
      <p className="text-sm font-medium text-[var(--text-secondary)]">No notes generated yet.</p>
      <p className="text-xs">Run the processing pipeline to generate structured notes.</p>
    </div>
  );
}

// ─── Notes Page ───────────────────────────────────────────────────────────────

export default function Notes() {
  const { currentLectureId, lectures } = useLectureStore();
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const pushToast = useToastStore((state) => state.pushToast);
  const currentLecture = lectures.find((l) => l.id === currentLectureId) ?? null;

  const [notes, setNotes] = useState<StructuredNotes | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!currentLectureId) {
      setNotes(null);
      return;
    }

    setNotes(null);
    setError(null);
    setIsLoading(true);

    try {
      const raw = await getNotes(currentLectureId);
      if (!raw) {
        setNotes(null);
        return;
      }

      try {
        setNotes(JSON.parse(raw) as StructuredNotes);
      } catch {
        setError("Failed to parse notes data.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [currentLectureId]);

  // ── Load notes from backend ─────────────────────────────────────────────────
  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // ── Regenerate ──────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!currentLectureId || isRegenerating) return;
    setIsRegenerating(true);
    setError(null);

    try {
      const raw = await regenerateNotes(currentLectureId);
      if (raw) {
        setNotes(JSON.parse(raw) as StructuredNotes);
        pushToast({ kind: "success", message: "Notes regenerated successfully." });
      } else {
        pushToast({ kind: "warning", message: "Notes regeneration returned no data." });
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to regenerate notes.");
      pushToast({ kind: "error", message: "Failed to regenerate notes." });
    } finally {
      setIsRegenerating(false);
    }
  }, [currentLectureId, isRegenerating, pushToast]);

  // ── ToC ─────────────────────────────────────────────────────────────────────
  const tocItems = notes ? buildToc(notes, Boolean(currentLecture?.summary)) : [];
  const tocIds = tocItems.map((item) => item.id);
  const activeId = useActiveSection(tocIds);
  const notesContainerClass = isSidebarCollapsed
    ? "mx-auto w-full max-w-[1240px] space-y-6"
    : "mx-auto w-full max-w-[900px] space-y-6";

  useEffect(() => {
    if (isSidebarCollapsed) {
      setIsOutlineOpen(false);
    }
  }, [isSidebarCollapsed]);

  // ── No lecture ──────────────────────────────────────────────────────────────
  if (!currentLectureId || !currentLecture) {
    return (
      <div className={notesContainerClass}>
        <ViewHeader
          title="Notes"
          description="Structured summaries, key concepts, and takeaways."
        />
        <EmptyState reason="no-lecture" />
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={notesContainerClass}>
        <ViewHeader title="Notes" description={currentLecture.filename} />
        <NotesSkeleton />
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={notesContainerClass}>
        <ViewHeader title="Notes" description={currentLecture.filename} />
        <div className="bg-[var(--color-error-muted)] border border-[var(--color-error-muted)] rounded-lg p-4 text-[var(--color-error)] text-sm">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void loadNotes()}
          className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── No notes yet ────────────────────────────────────────────────────────────
  if (!notes) {
    return (
      <div className={notesContainerClass}>
        <ViewHeader
          title="Notes"
          description={currentLecture.filename}
          actions={
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex items-center gap-2 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:bg-[var(--accent-primary-hover)]"
            >
              {isRegenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating…
                </>
              ) : (
                "Generate Notes"
              )}
            </button>
          }
        />
        <EmptyState reason="no-notes" />
      </div>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className={notesContainerClass}>
      <ViewHeader
        title="Notes"
        description={currentLecture.filename}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOutlineOpen((previous) => !previous)}
              className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--bg-surface-overlay)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] active:scale-[0.97]"
            >
              {isOutlineOpen ? "Hide Outline" : "Show Outline"}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--border-strong)] disabled:opacity-60"
            >
              {isRegenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-transparent" />
                  Regenerating…
                </>
              ) : (
                "Regenerate"
              )}
            </button>
          </div>
        }
      />

      {isOutlineOpen && (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 shadow-sm lg:hidden">
          <TableOfContents items={tocItems} activeId={activeId} />
        </div>
      )}

      <div className="relative flex h-full gap-6">
        {isOutlineOpen && (
          <aside className="hidden w-56 flex-shrink-0 lg:block">
            <div className="sticky top-6 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 shadow-sm">
              <TableOfContents items={tocItems} activeId={activeId} />
            </div>
          </aside>
        )}

        {/* ── Main document area ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Export bar */}
          <NotesExport
            lectureId={currentLectureId}
            notes={notes}
            summary={currentLecture.summary}
          />

          {/* Notes document */}
          <ExplainableTextView lectureId={currentLectureId}>
            <StructuredNotesView notes={notes} summary={currentLecture.summary} />
          </ExplainableTextView>
        </div>
      </div>
    </div>
  );
}
