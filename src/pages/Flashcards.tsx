import { useCallback, useEffect, useState } from "react";
import { AnkiExport, FlashcardViewer } from "../components/Flashcards";
import { getFlashcards } from "../lib/tauriApi";
import type { Flashcard, FlashcardsOutput } from "../lib/types";
import { useLectureStore } from "../stores/lectureStore";

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-lecture" | "no-flashcards" }) {
  if (reason === "no-lecture") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
        <span className="text-4xl">🃏</span>
        <p className="text-sm">No lecture selected.</p>
        <p className="text-xs">Upload and process a lecture to generate flashcards.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
      <span className="text-4xl">🃏</span>
      <p className="text-sm font-medium text-slate-300">No flashcards generated yet.</p>
      <p className="text-xs">Run the processing pipeline to generate flashcards.</p>
    </div>
  );
}

// ─── Flashcards Page ──────────────────────────────────────────────────────────

export default function Flashcards() {
  const { currentLectureId } = useLectureStore();

  const [cards, setCards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load flashcards from backend
  const loadFlashcards = useCallback(async (lectureId: string) => {
    setCards([]);
    setError(null);
    setIsLoading(true);

    try {
      const raw = await getFlashcards(lectureId);
      if (raw) {
        const parsed = JSON.parse(raw) as FlashcardsOutput;
        setCards(Array.isArray(parsed.cards) ? parsed.cards : []);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentLectureId) return;
    loadFlashcards(currentLectureId);
  }, [currentLectureId, loadFlashcards]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!currentLectureId) {
    return (
      <div className="p-6">
        <EmptyState reason="no-lecture" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-3">
        <svg className="w-6 h-6 animate-spin text-indigo-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Loading flashcards…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-800/40 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="p-6">
        <EmptyState reason="no-flashcards" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Flashcards</h1>
          <p className="text-xs text-slate-500 mt-0.5">{cards.length} cards generated</p>
        </div>
      </div>

      {/* Card Viewer */}
      <FlashcardViewer cards={cards} />

      {/* Export */}
      <AnkiExport lectureId={currentLectureId} cardCount={cards.length} />
    </div>
  );
}
