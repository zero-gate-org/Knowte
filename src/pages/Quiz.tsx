import { useCallback, useEffect, useState } from "react";
import { QuizSkeleton } from "../components/Skeletons";
import { QuizPlayer, QuizResults } from "../components/Quiz";
import { ViewHeader } from "../components/Layout";
import type { UserAnswers } from "../components/Quiz";
import { getQuiz, regenerateQuiz, saveQuizAttempt } from "../lib/tauriApi";
import type { Quiz } from "../lib/types";
import { useLectureStore, useToastStore } from "../stores";

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-lecture" | "no-quiz" }) {
  if (reason === "no-lecture") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-2">
        <span className="text-4xl">🧠</span>
        <p className="text-sm">No knowte selected.</p>
        <p className="text-xs">Add and process a knowte to take a quiz.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-2">
      <span className="text-4xl">🧠</span>
      <p className="text-sm font-medium text-[var(--text-secondary)]">No quiz generated yet.</p>
      <p className="text-xs">Run the processing pipeline to generate a quiz.</p>
    </div>
  );
}

// ─── Quiz Page ────────────────────────────────────────────────────────────────

export default function Quiz() {
  const { currentLectureId } = useLectureStore();
  const pushToast = useToastStore((state) => state.pushToast);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [showResults, setShowResults] = useState(false);
  const [completedAnswers, setCompletedAnswers] = useState<UserAnswers>({});
  const [completedScore, setCompletedScore] = useState(0);

  const loadQuiz = useCallback(async () => {
    if (!currentLectureId) {
      setQuiz(null);
      return;
    }

    setQuiz(null);
    setError(null);
    setShowResults(false);
    setIsLoading(true);

    try {
      const raw = await getQuiz(currentLectureId);
      if (!raw) {
        setQuiz(null);
        return;
      }

      try {
        setQuiz(JSON.parse(raw) as Quiz);
      } catch {
        setError("Failed to parse quiz data.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [currentLectureId]);

  // ── Load quiz from backend ────────────────────────────────────────────────
  useEffect(() => {
    void loadQuiz();
  }, [loadQuiz]);

  // ── Regenerate quiz ───────────────────────────────────────────────────────
  const handleRegenerateQuiz = useCallback(async () => {
    if (!currentLectureId || isRegenerating) return;
    setIsRegenerating(true);
    setError(null);
    setShowResults(false);

    try {
      const raw = await regenerateQuiz(currentLectureId);
      if (raw) {
        setQuiz(JSON.parse(raw) as Quiz);
        pushToast({ kind: "success", message: "Quiz regenerated successfully." });
      } else {
        pushToast({ kind: "warning", message: "Quiz regeneration returned no questions." });
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to regenerate quiz.");
      pushToast({ kind: "error", message: "Failed to regenerate quiz." });
    } finally {
      setIsRegenerating(false);
    }
  }, [currentLectureId, isRegenerating, pushToast]);

  // ── On quiz completed ─────────────────────────────────────────────────────
  const handleQuizComplete = useCallback(
    async (answers: UserAnswers, score: number) => {
      setCompletedAnswers(answers);
      setCompletedScore(score);
      setShowResults(true);

      // Save attempt in background (non-blocking)
      if (currentLectureId) {
        const total = quiz?.questions.length ?? 0;
        saveQuizAttempt(currentLectureId, JSON.stringify(answers), score, total).catch(
          () =>
            pushToast({
              kind: "warning",
              message: "Quiz attempt completed, but saving history failed.",
            }),
        );
      }
    },
    [currentLectureId, quiz, pushToast],
  );

  // ── Retake quiz ──────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    setShowResults(false);
    setCompletedAnswers({});
    setCompletedScore(0);
  }, []);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!currentLectureId) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Quiz"
          description="Practice key concepts from your knowte."
        />
        <EmptyState reason="no-lecture" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Quiz"
          description="Practice key concepts from your knowte."
        />
        <QuizSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Quiz"
          description="Practice key concepts from your knowte."
        />
        <div className="bg-[var(--color-error-muted)] border border-[var(--color-error-muted)] rounded-lg p-4 text-[var(--color-error)] text-sm">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void loadQuiz()}
          className="rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Quiz"
          description="Practice key concepts from your knowte."
          actions={
            <button
              onClick={handleRegenerateQuiz}
              disabled={isRegenerating}
              className="flex items-center gap-2 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60 hover:bg-[var(--accent-primary-hover)]"
            >
              {isRegenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating…
                </>
              ) : (
                "Generate Quiz"
              )}
            </button>
          }
        />
        <EmptyState reason="no-quiz" />
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <ViewHeader
        title="Quiz"
        description={`${quiz.questions.length} question${quiz.questions.length !== 1 ? "s" : ""}`}
        actions={
          !showResults ? (
            <button
              onClick={handleRegenerateQuiz}
              disabled={isRegenerating}
              className="flex items-center gap-2 rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] disabled:opacity-60 hover:bg-[var(--border-strong)]"
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
          ) : null
        }
      />

      {/* Quiz player or results */}
      {showResults ? (
        <QuizResults
          quiz={quiz}
          answers={completedAnswers}
          score={completedScore}
          onRetake={handleRetake}
          onRegenerateQuiz={handleRegenerateQuiz}
          isRegenerating={isRegenerating}
        />
      ) : (
        <QuizPlayer
          quiz={quiz}
          onComplete={handleQuizComplete}
          onRegenerateQuiz={handleRegenerateQuiz}
          isRegenerating={isRegenerating}
        />
      )}
    </div>
  );
}
