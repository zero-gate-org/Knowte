import type { Question, QuestionDifficulty } from "../../lib/types";

// ─── Difficulty Badge ─────────────────────────────────────────────────────────

const DIFFICULTY_STYLES: Record<QuestionDifficulty, string> = {
  easy: "bg-emerald-900/40 text-emerald-400 border border-emerald-700/40",
  medium: "bg-amber-900/40 text-amber-400 border border-amber-700/40",
  hard: "bg-red-900/40 text-red-400 border border-red-700/40",
};

function DifficultyBadge({ difficulty }: { difficulty: QuestionDifficulty }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${DIFFICULTY_STYLES[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}

// ─── Multiple Choice Input ────────────────────────────────────────────────────

interface MultipleChoiceProps {
  options: string[];
  selected: string | null;
  submitted: boolean;
  correctAnswer: string;
  onSelect: (option: string) => void;
}

function MultipleChoiceInput({
  options,
  selected,
  submitted,
  correctAnswer,
  onSelect,
}: MultipleChoiceProps) {
  return (
    <div className="space-y-2.5 mt-5">
      {options.map((option, i) => {
        const isSelected = selected === option;
        const isCorrect = option === correctAnswer;

        let cardStyle =
          "border border-slate-700 bg-slate-800/60 text-slate-200 hover:border-violet-500/60 hover:bg-slate-700/50";

        if (submitted) {
          if (isCorrect) {
            cardStyle = "border border-emerald-500 bg-emerald-900/30 text-emerald-200";
          } else if (isSelected && !isCorrect) {
            cardStyle = "border border-red-500 bg-red-900/30 text-red-200";
          } else {
            cardStyle = "border border-slate-700/50 bg-slate-800/30 text-slate-500";
          }
        } else if (isSelected) {
          cardStyle = "border border-violet-500 bg-violet-900/30 text-violet-100";
        }

        return (
          <button
            key={i}
            onClick={() => !submitted && onSelect(option)}
            disabled={submitted}
            className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150 ${cardStyle} ${!submitted ? "cursor-pointer" : "cursor-default"}`}
          >
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                submitted && isCorrect
                  ? "border-emerald-400 bg-emerald-500 text-white"
                  : submitted && isSelected && !isCorrect
                    ? "border-red-400 bg-red-500 text-white"
                    : isSelected
                      ? "border-violet-400 bg-violet-500 text-white"
                      : "border-slate-600"
              }`}
            >
              {submitted && isCorrect ? "✓" : submitted && isSelected && !isCorrect ? "✗" : ""}
            </span>
            <span className="text-sm leading-relaxed">{option}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── True / False Input ───────────────────────────────────────────────────────

interface TrueFalseProps {
  selected: string | null;
  submitted: boolean;
  correctAnswer: string;
  onSelect: (value: string) => void;
}

function TrueFalseInput({ selected, submitted, correctAnswer, onSelect }: TrueFalseProps) {
  const options = ["True", "False"];

  return (
    <div className="flex gap-4 mt-5">
      {options.map((option) => {
        const isSelected = selected === option;
        const isCorrect = option === correctAnswer;

        let style =
          "flex-1 py-4 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-200 hover:border-violet-500/60 hover:bg-slate-700/50 font-semibold text-base transition-all duration-150";

        if (submitted) {
          if (isCorrect) {
            style =
              "flex-1 py-4 rounded-xl border border-emerald-500 bg-emerald-900/30 text-emerald-200 font-semibold text-base";
          } else if (isSelected && !isCorrect) {
            style =
              "flex-1 py-4 rounded-xl border border-red-500 bg-red-900/30 text-red-200 font-semibold text-base";
          } else {
            style =
              "flex-1 py-4 rounded-xl border border-slate-700/50 bg-slate-800/30 text-slate-500 font-semibold text-base";
          }
        } else if (isSelected) {
          style =
            "flex-1 py-4 rounded-xl border border-violet-500 bg-violet-900/30 text-violet-100 font-semibold text-base";
        }

        return (
          <button
            key={option}
            onClick={() => !submitted && onSelect(option)}
            disabled={submitted}
            className={`${style} ${!submitted ? "cursor-pointer" : "cursor-default"}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

// ─── Short Answer Input ───────────────────────────────────────────────────────

interface ShortAnswerProps {
  value: string;
  submitted: boolean;
  correctAnswer: string;
  onChange: (value: string) => void;
}

function ShortAnswerInput({ value, submitted, correctAnswer, onChange }: ShortAnswerProps) {
  return (
    <div className="mt-5 space-y-2">
      <textarea
        value={value}
        onChange={(e) => !submitted && onChange(e.target.value)}
        disabled={submitted}
        placeholder="Type your answer here…"
        rows={3}
        className={`w-full px-4 py-3 rounded-lg border text-sm leading-relaxed resize-none transition-colors focus:outline-none ${
          submitted
            ? "border-slate-600 bg-slate-800/30 text-slate-500 cursor-default"
            : "border-slate-600 bg-slate-800/60 text-slate-100 placeholder-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
        }`}
      />
      {submitted && (
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-emerald-400">Model answer: </span>
          {correctAnswer}
        </p>
      )}
    </div>
  );
}

// ─── Question Card ────────────────────────────────────────────────────────────

export interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  userAnswer: string | null;
  submitted: boolean;
  onAnswerChange: (answer: string) => void;
}

export function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  userAnswer,
  submitted,
  onAnswerChange,
}: QuestionCardProps) {
  const correct = submitted && userAnswer === question.correct_answer;
  const incorrect = submitted && userAnswer !== null && userAnswer !== question.correct_answer;

  return (
    <div className="w-full">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-400 font-medium">
          Question {questionNumber} of {totalQuestions}
        </span>
        <DifficultyBadge difficulty={question.difficulty} />
      </div>

      {/* Question text */}
      <p className="text-slate-100 text-lg font-medium leading-relaxed mb-1">
        {question.question}
      </p>

      {/* Inputs */}
      {question.type === "multiple_choice" && question.options && (
        <MultipleChoiceInput
          options={question.options}
          selected={userAnswer}
          submitted={submitted}
          correctAnswer={question.correct_answer}
          onSelect={onAnswerChange}
        />
      )}

      {question.type === "true_false" && (
        <TrueFalseInput
          selected={userAnswer}
          submitted={submitted}
          correctAnswer={question.correct_answer}
          onSelect={onAnswerChange}
        />
      )}

      {question.type === "short_answer" && (
        <ShortAnswerInput
          value={userAnswer ?? ""}
          submitted={submitted}
          correctAnswer={question.correct_answer}
          onChange={onAnswerChange}
        />
      )}

      {/* Post-submit feedback */}
      {submitted && (
        <div
          className={`mt-5 rounded-lg p-4 border transition-all duration-300 ${
            correct
              ? "bg-emerald-900/20 border-emerald-700/50"
              : incorrect
                ? "bg-red-900/20 border-red-700/50"
                : "bg-slate-800/40 border-slate-700/50"
          }`}
        >
          {correct && (
            <p className="text-emerald-400 font-semibold text-sm mb-1.5">✓ Correct!</p>
          )}
          {incorrect && (
            <div className="mb-1.5">
              <p className="text-red-400 font-semibold text-sm">✗ Incorrect</p>
              {question.type !== "short_answer" && (
                <p className="text-slate-300 text-sm mt-1">
                  Correct answer:{" "}
                  <span className="font-semibold text-emerald-400">
                    {question.correct_answer}
                  </span>
                </p>
              )}
            </div>
          )}
          {!submitted || (!correct && !incorrect) ? null : (
            <p className="text-slate-300 text-sm leading-relaxed mt-1">
              <span className="text-slate-400 font-medium">Explanation: </span>
              {question.explanation}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
