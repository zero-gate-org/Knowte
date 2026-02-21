import { useNavigate } from "react-router-dom";
import ProgressTracker from "../components/Pipeline/ProgressTracker";
import { ViewHeader } from "../components/Layout";
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
    <div className="mx-auto max-w-[900px] space-y-6">
      <ViewHeader
        title="Processing Knowte"
        description={
          currentLecture
            ? `Generating AI content for "${currentLecture.filename}"…`
            : "Running AI pipeline…"
        }
      />

      {currentLectureId ? (
        <ProgressTracker
          lectureId={currentLectureId}
          onPipelineComplete={handlePipelineComplete}
        />
      ) : (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-6 py-10 text-center text-[var(--text-muted)] shadow-sm">
          No knowte selected. Please add and process a knowte first.
        </div>
      )}

      {/* Navigation shortcuts */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/notes`)}
          disabled={!currentLectureId}
          className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          View Notes
        </button>
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/quiz`)}
          disabled={!currentLectureId}
          className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          View Quiz
        </button>
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/flashcards`)}
          disabled={!currentLectureId}
          className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          View Flashcards
        </button>
        <button
          type="button"
          onClick={() => currentLectureId && navigate(`/lecture/${currentLectureId}/mindmap`)}
          disabled={!currentLectureId}
          className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          View Mind Map
        </button>
      </div>
    </div>
  );
}
