import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components";
import { ToastViewport } from "./components/Toast";
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
import { useLectureStore } from "./stores";
import "./index.css";

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

function AppLayout() {
  const location = useLocation();
  const { setLectures, setCurrentLecture } = useLectureStore();

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

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
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
