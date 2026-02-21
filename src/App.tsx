import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { KeyboardShortcutsModal, Sidebar, TitleBar } from "./components";
import { ToastViewport } from "./components/Toast";
import { useHotkeys } from "./hooks";
import { HOTKEY_EVENT_NAMES, LECTURE_VIEW_SHORTCUTS } from "./lib/hotkeys";
import { listLectures } from "./lib/tauriApi";
import type { Lecture, LectureSummary, ThemeMode } from "./lib/types";
import { useLectureStore, useSettingsStore, useToastStore, useUiStore } from "./stores";
import "./index.css";

const Upload = lazy(() => import("./pages/Upload"));
const Library = lazy(() => import("./pages/Library"));
const Transcript = lazy(() => import("./pages/Transcript"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Notes = lazy(() => import("./pages/Notes"));
const Quiz = lazy(() => import("./pages/Quiz"));
const Research = lazy(() => import("./pages/Research"));
const MindMap = lazy(() => import("./pages/MindMap"));
const Flashcards = lazy(() => import("./pages/Flashcards"));
const Settings = lazy(() => import("./pages/Settings"));
const Compare = lazy(() => import("./pages/Compare"));

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
  if (pathname === "/compare") return "Compare";
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
  const isDesktop = isTauri();
  const location = useLocation();
  const navigate = useNavigate();
  const mainContentRef = useRef<HTMLElement | null>(null);

  const {
    lectures,
    currentLectureId,
    setLectures,
    setCurrentLecture,
  } = useLectureStore();
  const {
    settings,
    loadSettings,
    saveSettings,
  } = useSettingsStore();
  const {
    isSidebarCollapsed,
    toggleSidebarCollapsed,
  } = useUiStore();
  const pushToast = useToastStore((state) => state.pushToast);

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [routeAnnouncement, setRouteAnnouncement] = useState("");
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [isThemeSaving, setIsThemeSaving] = useState(false);

  useEffect(() => {
    setCurrentLecture(extractLectureId(location.pathname));
  }, [location.pathname, setCurrentLecture]);

  useEffect(() => {
    if (!isDesktop) {
      return;
    }
    void loadSettings({ includeDiagnostics: false });
  }, [isDesktop, loadSettings]);

  useEffect(() => {
    if (settings?.theme === "dark" || settings?.theme === "light") {
      setTheme(settings.theme);
    }
  }, [settings?.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      isSidebarCollapsed ? "4rem" : "16rem",
    );
  }, [isSidebarCollapsed]);

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

  const handleToggleTheme = useCallback(async () => {
    if (isThemeSaving) {
      return;
    }

    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);

    if (!isDesktop || !settings) {
      return;
    }

    setIsThemeSaving(true);
    const success = await saveSettings({ ...settings, theme: nextTheme });
    if (!success) {
      setTheme(theme);
      pushToast({
        kind: "error",
        message: "Unable to save theme preference.",
      });
    }
    setIsThemeSaving(false);
  }, [isDesktop, isThemeSaving, pushToast, saveSettings, settings, theme]);

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
    <div className="flex h-screen flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TitleBar
        currentViewLabel={viewLabelFromPath(location.pathname)}
        theme={theme}
        onToggleTheme={() => void handleToggleTheme()}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebarCollapsed}
        />

        <main
          ref={mainContentRef}
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-auto bg-slate-100/90 p-6 dark:bg-slate-950/50"
        >
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {routeAnnouncement}
          </p>
          <div key={location.pathname} className="h-full animate-view-in">
            <Suspense
              fallback={(
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Loading view...
                </div>
              )}
            >
              <Routes>
                <Route path="/" element={<Library />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/compare" element={<Compare />} />
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
            </Suspense>
          </div>
        </main>
      </div>

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
