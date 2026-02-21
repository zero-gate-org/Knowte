import { useCallback, useEffect, useState } from "react";
import { QuizSkeleton } from "../components/Skeletons";
import { QuizPlayer, QuizResults } from "../components/Quiz";
import type { UserAnswers } from "../components/Quiz";
import { getQuiz, regenerateQuiz, saveQuizAttempt } from "../lib/tauriApi";
import type { Quiz } from "../lib/types";
import { useLectureStore, useToastStore } from "../stores";

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-lecture" | "no-quiz" }) {
  if (reason === "no-lecture") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
        <span className="text-4xl">🧠</span>
        <p className="text-sm">No lecture selected.</p>
        <p className="text-xs">Upload and process a lecture to take a quiz.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
      <span className="text-4xl">🧠</span>
      <p className="text-sm font-medium text-slate-300">No quiz generated yet.</p>
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
    return <EmptyState reason="no-lecture" />;
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-100">Interactive Quiz</h1>
        <QuizSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100">Interactive Quiz</h1>
        <div className="bg-red-950/40 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void loadQuiz()}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100">Interactive Quiz</h1>
          <button
            onClick={handleRegenerateQuiz}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isRegenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>✨ Generate Quiz</>
            )}
          </button>
        </div>
        <EmptyState reason="no-quiz" />
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Interactive Quiz</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {quiz.questions.length} question{quiz.questions.length !== 1 ? "s" : ""}
          </p>
        </div>
        {!showResults && (
          <button
            onClick={handleRegenerateQuiz}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-slate-200 rounded-lg text-sm font-medium transition-colors"
          >
            {isRegenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Regenerating…
              </>
            ) : (
              <>🔄 Regenerate</>
            )}
          </button>
        )}
      </div>

      <div className="border-t border-slate-700" />

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
