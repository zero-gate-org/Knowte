import { useNavigate } from "react-router-dom";
import ProgressTracker from "../components/Pipeline/ProgressTracker";
import { useLectureStore } from "../stores";

export default function Pipeline() {
  const navigate = useNavigate();
  const { currentLectureId, lectures } = useLectureStore();

  const currentLecture = lectures.find((l) => l.id === currentLectureId) ?? null;

  const handlePipelineComplete = () => {
    if (currentLectureId) {
      useLectureStore.getState().updateLecture(currentLectureId, { status: "complete" });
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-100">Processing Lecture</h1>
        <p className="text-sm text-slate-400">
          {currentLecture
            ? `Generating AI content for "${currentLecture.filename}"…`
            : "Running AI pipeline…"}
        </p>
      </header>

      {currentLectureId ? (
        <ProgressTracker
          lectureId={currentLectureId}
          onPipelineComplete={handlePipelineComplete}
        />
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-800 px-6 py-10 text-center text-slate-400">
          No lecture selected. Please upload and process a lecture first.
        </div>
      )}

      {/* Navigation shortcuts */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/notes`)}
          disabled={!currentLectureId}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          View Notes
        </button>
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/quiz`)}
          disabled={!currentLectureId}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          View Quiz
        </button>
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/flashcards`)}
          disabled={!currentLectureId}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          View Flashcards
        </button>
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/mindmap`)}
          disabled={!currentLectureId}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          View Mind Map
        </button>
      </div>
    </div>
  );
}
