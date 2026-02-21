import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { KeyboardShortcutsModal, Sidebar } from "./components";
import { ToastViewport } from "./components/Toast";
import { useHotkeys } from "./hooks";
import { HOTKEY_EVENT_NAMES, LECTURE_VIEW_SHORTCUTS } from "./lib/hotkeys";
import { listLectures } from "./lib/tauriApi";
import type { Lecture, LectureSummary } from "./lib/types";
import {
  Flashcards,
  Library,
  MindMap,
  Notes,
  Pipeline,
  Quiz,
  Research,
  Settings,
  Transcript,
  Upload,
} from "./pages";
import { useLectureStore, useToastStore } from "./stores";
import "./index.css";

const LECTURE_ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  LECTURE_VIEW_SHORTCUTS.map((shortcut) => [shortcut.segment, shortcut.label]),
);

function summaryToLecture(summary: LectureSummary): Lecture {
  return {
    id: summary.id,
    title: summary.title,
    filename: summary.filename,
    audioPath: summary.audio_path,
    duration: summary.duration,
    status: summary.status,
    createdAt: summary.created_at,
    summary: summary.summary,
    stagesComplete: summary.stages_complete,
  };
}

function extractLectureId(pathname: string): string | null {
  const match = pathname.match(/^\/lecture\/([^/]+)/);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function extractLectureSegment(pathname: string): string | null {
  const match = pathname.match(/^\/lecture\/[^/]+\/([^/]+)/);
  return match ? match[1] : null;
}

function viewLabelFromPath(pathname: string): string {
  if (pathname === "/") return "Library";
  if (pathname === "/upload") return "Upload";
  if (pathname === "/settings") return "Settings";

  const lectureSegment = extractLectureSegment(pathname);
  if (lectureSegment) {
    return LECTURE_ROUTE_LABELS[lectureSegment] ?? "Lecture";
  }

  return "View";
}

function isElementDisabled(element: HTMLElement): boolean {
  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLOptionElement
  ) {
    return element.disabled;
  }

  return element.getAttribute("aria-disabled") === "true";
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainContentRef = useRef<HTMLElement | null>(null);

  const {
    lectures,
    currentLectureId,
    setLectures,
    setCurrentLecture,
  } = useLectureStore();
  const pushToast = useToastStore((state) => state.pushToast);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [routeAnnouncement, setRouteAnnouncement] = useState("");

  useEffect(() => {
    setCurrentLecture(extractLectureId(location.pathname));
  }, [location.pathname, setCurrentLecture]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const lectures = await listLectures();
        if (!cancelled) {
          setLectures(lectures.map(summaryToLecture));
        }
      } catch {
        if (!cancelled) {
          setLectures([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setLectures]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mainContentRef.current?.focus({ preventScroll: true });
    });

    setRouteAnnouncement(`Navigated to ${viewLabelFromPath(location.pathname)}.`);

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const activeLectureSegment = useMemo(
    () => extractLectureSegment(location.pathname),
    [location.pathname],
  );

  const openShortcutsModal = useCallback(() => {
    setIsShortcutsOpen(true);
  }, []);

  const closeShortcutsModal = useCallback(() => {
    setIsShortcutsOpen(false);
  }, []);

  const goToUpload = useCallback(() => {
    navigate("/upload");
  }, [navigate]);

  const goToLibrary = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const goToSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const goToLectureView = useCallback(
    (viewNumber: number) => {
      const shortcut = LECTURE_VIEW_SHORTCUTS[viewNumber - 1];
      if (!shortcut) {
        return;
      }

      const lectureId = currentLectureId ?? lectures[0]?.id ?? null;
      if (!lectureId) {
        pushToast({
          kind: "warning",
          message: `Create or select a lecture first to open ${shortcut.label}.`,
        });
        return;
      }

      setCurrentLecture(lectureId);
      navigate(`/lecture/${encodeURIComponent(lectureId)}/${shortcut.segment}`);
    },
    [currentLectureId, lectures, navigate, pushToast, setCurrentLecture],
  );

  const handleEscape = useCallback(() => {
    if (isShortcutsOpen) {
      closeShortcutsModal();
    }

    window.dispatchEvent(new Event(HOTKEY_EVENT_NAMES.stopRecording));
  }, [closeShortcutsModal, isShortcutsOpen]);

  const handleToggleAudioPlayback = useCallback(() => {
    if (activeLectureSegment !== "transcript") {
      return false;
    }

    window.dispatchEvent(new Event(HOTKEY_EVENT_NAMES.toggleTranscriptPlayback));
    return true;
  }, [activeLectureSegment]);

  const handlePreviousItem = useCallback(() => {
    if (activeLectureSegment === "flashcards") {
      window.dispatchEvent(new Event(HOTKEY_EVENT_NAMES.previousFlashcard));
      return true;
    }

    const hasActiveQuizPlayer = Boolean(
      mainContentRef.current?.querySelector('[data-quiz-player="true"]'),
    );
    if (activeLectureSegment === "quiz" && hasActiveQuizPlayer) {
      window.dispatchEvent(new Event(HOTKEY_EVENT_NAMES.previousQuizQuestion));
      return true;
    }

    return false;
  }, [activeLectureSegment]);

  const handleNextItem = useCallback(() => {
    if (activeLectureSegment === "flashcards") {
      window.dispatchEvent(new Event(HOTKEY_EVENT_NAMES.nextFlashcard));
      return true;
    }

    const hasActiveQuizPlayer = Boolean(
      mainContentRef.current?.querySelector('[data-quiz-player="true"]'),
    );
    if (activeLectureSegment === "quiz" && hasActiveQuizPlayer) {
      window.dispatchEvent(new Event(HOTKEY_EVENT_NAMES.nextQuizQuestion));
      return true;
    }

    return false;
  }, [activeLectureSegment]);

  const handleExportCurrentView = useCallback(() => {
    const root = mainContentRef.current;
    if (!root) {
      return false;
    }

    const exportTarget = Array.from(
      root.querySelectorAll<HTMLElement>('[data-hotkey-export="true"]'),
    ).find(
      (candidate) =>
        !isElementDisabled(candidate) && candidate.getClientRects().length > 0,
    );

    if (!exportTarget) {
      pushToast({
        kind: "info",
        message: "No export action is available on the current view.",
      });
      return true;
    }

    exportTarget.click();
    return true;
  }, [pushToast]);

  useHotkeys({
    onNewLecture: goToUpload,
    onNavigateLectureView: goToLectureView,
    onOpenSettings: goToSettings,
    onGoHome: goToLibrary,
    onEscape: handleEscape,
    onToggleAudioPlayback: handleToggleAudioPlayback,
    onPreviousItem: handlePreviousItem,
    onNextItem: handleNextItem,
    onExportCurrentView: handleExportCurrentView,
    onShowShortcuts: openShortcutsModal,
  });

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      <Sidebar />
      <main
        ref={mainContentRef}
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-auto p-6"
      >
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {routeAnnouncement}
        </p>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/lecture/:id/transcript" element={<Transcript />} />
          <Route path="/lecture/:id/pipeline" element={<Pipeline />} />
          <Route path="/lecture/:id/notes" element={<Notes />} />
          <Route path="/lecture/:id/quiz" element={<Quiz />} />
          <Route path="/lecture/:id/research" element={<Research />} />
          <Route path="/lecture/:id/mindmap" element={<MindMap />} />
          <Route path="/lecture/:id/flashcards" element={<Flashcards />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <KeyboardShortcutsModal isOpen={isShortcutsOpen} onClose={closeShortcutsModal} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
      <ToastViewport />
    </BrowserRouter>
  );
}

export default App;
