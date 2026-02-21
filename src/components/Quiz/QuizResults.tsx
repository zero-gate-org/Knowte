import { useState } from "react";
import type { Question, Quiz } from "../../lib/types";
import type { UserAnswers } from "./QuizPlayer";

// ─── Circular Progress ────────────────────────────────────────────────────────

interface CircularProgressProps {
  score: number;
  total: number;
}

function CircularProgress({ score, total }: CircularProgressProps) {
  const pct = total === 0 ? 0 : score / total;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - pct);

  const color =
    pct >= 0.7
      ? { stroke: "#22c55e", text: "text-emerald-400", label: "Excellent!" }
      : pct >= 0.5
        ? { stroke: "#f59e0b", text: "text-amber-400", label: "Good effort!" }
        : { stroke: "#ef4444", text: "text-red-400", label: "Keep practicing" };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg
          aria-hidden="true"
          width="132"
          height="132"
          viewBox="0 0 132 132"
          className="-rotate-90"
        >
          {/* Background circle */}
          <circle
            cx="66"
            cy="66"
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth="10"
          />
          {/* Progress arc */}
          <circle
            cx="66"
            cy="66"
            r={radius}
            fill="none"
            stroke={color.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700"
          />
        </svg>
        {/* Score label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color.text}`}>{score}</span>
          <span className="text-slate-400 text-sm">/ {total}</span>
        </div>
      </div>
      <p className={`text-sm font-semibold ${color.text}`}>{color.label}</p>
      <p className="text-slate-300 text-base font-medium">
        {Math.round(pct * 100)}% correct
      </p>
    </div>
  );
}

// ─── Question Row (expandable) ────────────────────────────────────────────────

interface QuestionRowProps {
  question: Question;
  userAnswer: string | undefined;
  index: number;
}

function QuestionRow({ question, userAnswer, index }: QuestionRowProps) {
  const [expanded, setExpanded] = useState(false);

  const isShortAnswer = question.type === "short_answer";
  const correct = isShortAnswer
    ? userAnswer !== undefined && userAnswer.trim() !== ""
    : userAnswer === question.correct_answer;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        correct
          ? "border-emerald-700/40 bg-emerald-900/10"
          : "border-red-700/40 bg-red-900/10"
      }`}
    >
      <button
        onClick={() => !correct && setExpanded((e) => !e)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left ${!correct ? "cursor-pointer" : "cursor-default"}`}
      >
        <span
          className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
            correct
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {correct ? "✓" : "✗"}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 leading-snug">
            <span className="text-slate-500 mr-1.5">Q{index + 1}.</span>
            {question.question}
          </p>
          {!correct && !expanded && (
            <p className="text-xs text-slate-500 mt-0.5">
              Click to see explanation
            </p>
          )}
        </div>

        {!correct && (
          <span className="flex-shrink-0 text-slate-500 text-sm">
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </button>

      {/* Expanded explanation for wrong answers */}
      {!correct && expanded && (
        <div className="px-4 pb-4 pt-0 pl-12 space-y-1.5">
          <p className="text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Your answer: </span>
            {userAnswer && userAnswer.trim() !== "" ? (
              <span className="text-red-300">{userAnswer}</span>
            ) : (
              <span className="italic text-slate-600">Not answered</span>
            )}
          </p>
          {!isShortAnswer && (
            <p className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Correct answer: </span>
              <span className="text-emerald-400">{question.correct_answer}</span>
            </p>
          )}
          <p className="text-xs text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Explanation: </span>
            {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Quiz Results ─────────────────────────────────────────────────────────────

export interface QuizResultsProps {
  quiz: Quiz;
  answers: UserAnswers;
  score: number;
  onRetake: () => void;
  onRegenerateQuiz: () => void;
  isRegenerating: boolean;
}

export function QuizResults({
  quiz,
  answers,
  score,
  onRetake,
  onRegenerateQuiz,
  isRegenerating,
}: QuizResultsProps) {
  const questions = quiz.questions;
  const total = questions.length;

  return (
    <div className="max-w-2xl mx-auto w-full space-y-8">
      {/* Score card */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 flex flex-col items-center gap-6 shadow-xl shadow-slate-900/30">
        <h2 className="text-2xl font-bold text-slate-100">Quiz Complete!</h2>
        <CircularProgress score={score} total={total} />

        {/* Action buttons */}
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={onRetake}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-700 hover:bg-violet-600 text-white font-semibold text-sm rounded-lg transition-colors"
          >
            🔁 Retake Quiz
          </button>
          <button
            onClick={onRegenerateQuiz}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 font-semibold text-sm rounded-lg transition-colors"
          >
            {isRegenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>✨ Generate New Quiz</>
            )}
          </button>
        </div>
      </div>

      {/* Question review list */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-300">Question Review</h3>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuestionRow
              key={q.id}
              question={q}
              userAnswer={answers[q.id]}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
