import { useCallback, useEffect, useRef, useState } from "react";
import type { Flashcard } from "../../lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────

type Pile = "known" | "almost" | "unknown" | "unsorted";

interface CardState {
  card: Flashcard;
  originalIndex: number;
  pile: Pile;
}

interface StudyStats {
  known: number;
  almost: number;
  unknown: number;
}

// ─── Individual Card ────────────────────────────────────────────────────────

interface FlashcardProps {
  card: Flashcard;
  isFlipped: boolean;
  onFlip: () => void;
}

function FlashcardDisplay({ card, isFlipped, onFlip }: FlashcardProps) {
  return (
    <div
      className="relative w-full cursor-pointer select-none"
      style={{ perspective: "1200px", minHeight: "280px" }}
      onClick={onFlip}
      role="button"
      tabIndex={0}
      aria-label={isFlipped ? "Card back — click to flip to front" : "Card front — click to flip to back"}
      onKeyDown={(e) => e.key === "Enter" || e.key === " " ? onFlip() : undefined}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
          minHeight: "280px",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-xl"
          style={{ backfaceVisibility: "hidden" }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
            Front
          </span>
          <p className="text-xl font-medium text-slate-100 text-center leading-relaxed">
            {card.front}
          </p>
          <span className="mt-6 text-xs text-slate-600">Click to reveal answer</span>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-700 border border-indigo-500/40 rounded-2xl p-8 shadow-xl"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">
            Back
          </span>
          <p className="text-xl font-medium text-slate-100 text-center leading-relaxed">
            {card.back}
          </p>
          {card.tags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mt-5">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-700/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Study Mode End Screen ───────────────────────────────────────────────────

interface StudyCompleteProps {
  stats: StudyStats;
  total: number;
  onReviewAll: () => void;
  onReviewWeak: () => void;
}

function StudyComplete({ stats, total, onReviewAll, onReviewWeak }: StudyCompleteProps) {
  const weakCount = stats.almost + stats.unknown;
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-12">
      <div className="text-5xl">🎉</div>
      <h2 className="text-2xl font-bold text-slate-100">Round Complete!</h2>
      <div className="flex gap-6 text-center">
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold text-green-400">{stats.known}</span>
          <span className="text-xs text-slate-400 uppercase tracking-wide mt-1">Know it</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold text-yellow-400">{stats.almost}</span>
          <span className="text-xs text-slate-400 uppercase tracking-wide mt-1">Almost</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold text-red-400">{stats.unknown}</span>
          <span className="text-xs text-slate-400 uppercase tracking-wide mt-1">No clue</span>
        </div>
      </div>
      <p className="text-sm text-slate-400">
        You know {stats.known} of {total} cards ({Math.round((stats.known / total) * 100)}%)
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        {weakCount > 0 && (
          <button
            onClick={onReviewWeak}
            className="px-5 py-2.5 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-700/50 text-sm font-medium transition-colors"
          >
            Review weak cards ({weakCount})
          </button>
        )}
        <button
          onClick={onReviewAll}
          className="px-5 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
        >
          Review all again
        </button>
      </div>
    </div>
  );
}

// ─── Flashcard Viewer ────────────────────────────────────────────────────────

interface FlashcardViewerProps {
  cards: Flashcard[];
}

export default function FlashcardViewer({ cards }: FlashcardViewerProps) {
  const [cardStates, setCardStates] = useState<CardState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [studyComplete, setStudyComplete] = useState(false);
  const [stats, setStats] = useState<StudyStats>({ known: 0, almost: 0, unknown: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize card states
  useEffect(() => {
    setCardStates(
      cards.map((card, i) => ({ card, originalIndex: i, pile: "unsorted" })),
    );
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudyMode(false);
    setStudyComplete(false);
    setStats({ known: 0, almost: 0, unknown: 0 });
  }, [cards]);

  const currentCard = cardStates[currentIndex];

  const goNext = useCallback(() => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((i) => Math.min(i + 1, cardStates.length - 1)), 150);
  }, [cardStates.length]);

  const goPrev = useCallback(() => {
    setIsFlipped(false);
    setTimeout(() => setCurrentIndex((i) => Math.max(i - 1, 0)), 150);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  const shuffle = () => {
    setIsFlipped(false);
    setCurrentIndex(0);
    setCardStates((prev) => {
      const arr = [...prev];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    });
  };

  const startStudyMode = () => {
    setStudyMode(true);
    setStudyComplete(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStats({ known: 0, almost: 0, unknown: 0 });
    setCardStates((prev) => prev.map((cs) => ({ ...cs, pile: "unsorted" })));
  };

  const endStudyMode = () => {
    setStudyMode(false);
    setStudyComplete(false);
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const sortCard = (pile: "known" | "almost" | "unknown") => {
    const newStats = { ...stats, [pile]: stats[pile] + 1 };
    const nextIndex = currentIndex + 1;

    setCardStates((prev) =>
      prev.map((cs, i) => (i === currentIndex ? { ...cs, pile } : cs)),
    );

    if (nextIndex >= cardStates.length) {
      setStats(newStats);
      setStudyComplete(true);
    } else {
      setStats(newStats);
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(nextIndex), 150);
    }
  };

  const reviewWeak = () => {
    const weak = cardStates.filter((cs) => cs.pile === "almost" || cs.pile === "unknown");
    setCardStates(weak.map((cs) => ({ ...cs, pile: "unsorted" })));
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudyComplete(false);
    setStats({ known: 0, almost: 0, unknown: 0 });
  };

  const reviewAll = () => {
    setCardStates((prev) => prev.map((cs) => ({ ...cs, pile: "unsorted" })));
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudyComplete(false);
    setStats({ known: 0, almost: 0, unknown: 0 });
  };

  if (cardStates.length === 0) return null;

  return (
    <div ref={containerRef} className="flex flex-col h-full gap-4" style={{ outline: "none" }}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400 font-medium">
            {studyMode ? "Study Mode" : "Browse Mode"}
          </span>
          {studyMode && !studyComplete && (
            <span className="text-xs text-slate-500">
              {currentIndex + 1} / {cardStates.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!studyMode && (
            <>
              <button
                onClick={shuffle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                title="Shuffle cards"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                </svg>
                Shuffle
              </button>
              <button
                onClick={startStudyMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
              >
                Study Mode
              </button>
            </>
          )}
          {studyMode && (
            <button
              onClick={endStudyMode}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            >
              Exit Study Mode
            </button>
          )}
        </div>
      </div>

      {/* ── Study Complete Screen ── */}
      {studyMode && studyComplete ? (
        <StudyComplete
          stats={stats}
          total={cardStates.length}
          onReviewAll={reviewAll}
          onReviewWeak={reviewWeak}
        />
      ) : (
        <>
          {/* ── Card Counter (browse mode) ── */}
          {!studyMode && (
            <div className="text-center text-xs text-slate-500">
              Card {currentIndex + 1} of {cardStates.length}
            </div>
          )}

          {/* ── Card ── */}
          {currentCard && (
            <FlashcardDisplay
              card={currentCard.card}
              isFlipped={isFlipped}
              onFlip={() => setIsFlipped((f) => !f)}
            />
          )}

          {/* ── Tags (browse mode, shown below card front) ── */}
          {!studyMode && !isFlipped && currentCard?.card.tags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {currentCard.card.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs rounded-full bg-slate-700/80 text-slate-400 border border-slate-600/50"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* ── Navigation (browse mode) ── */}
          {!studyMode && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Previous
              </button>
              <button
                onClick={() => setIsFlipped((f) => !f)}
                className="px-5 py-2 rounded-xl text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
              >
                {isFlipped ? "Hide answer" : "Show answer"}
              </button>
              <button
                onClick={goNext}
                disabled={currentIndex === cardStates.length - 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Sorting Buttons (study mode) ── */}
          {studyMode && !studyComplete && (
            <div className="flex flex-col items-center gap-3">
              {!isFlipped && (
                <p className="text-xs text-slate-500 text-center">Flip the card first, then rate yourself</p>
              )}
              <div className="flex gap-3 flex-wrap justify-center">
                <button
                  onClick={() => sortCard("unknown")}
                  disabled={!isFlipped}
                  className="flex flex-col items-center px-5 py-3 rounded-xl bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-800/50 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed min-w-[90px]"
                >
                  <span className="text-lg">✗</span>
                  <span className="text-xs mt-0.5">No clue</span>
                </button>
                <button
                  onClick={() => sortCard("almost")}
                  disabled={!isFlipped}
                  className="flex flex-col items-center px-5 py-3 rounded-xl bg-yellow-900/40 hover:bg-yellow-800/60 text-yellow-300 border border-yellow-800/50 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed min-w-[90px]"
                >
                  <span className="text-lg">~</span>
                  <span className="text-xs mt-0.5">Almost</span>
                </button>
                <button
                  onClick={() => sortCard("known")}
                  disabled={!isFlipped}
                  className="flex flex-col items-center px-5 py-3 rounded-xl bg-green-900/40 hover:bg-green-800/60 text-green-300 border border-green-800/50 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed min-w-[90px]"
                >
                  <span className="text-lg">✓</span>
                  <span className="text-xs mt-0.5">Know it</span>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Keyboard shortcuts hint ── */}
      <div className="flex justify-center gap-4 text-[10px] text-slate-600 mt-auto">
        <span>← → Navigate</span>
        <span>Space / Enter Flip</span>
      </div>
    </div>
  );
}
