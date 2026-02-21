import { useCallback, useEffect, useState } from "react";
import { FlashcardSkeleton } from "../components/Skeletons";
import { AnkiExport, FlashcardViewer } from "../components/Flashcards";
import { ViewHeader } from "../components/Layout";
import { getFlashcards } from "../lib/tauriApi";
import type { Flashcard, FlashcardsOutput } from "../lib/types";
import { useLectureStore } from "../stores";

// ─── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-lecture" | "no-flashcards" }) {
  if (reason === "no-lecture") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-2">
        <span className="text-4xl">🃏</span>
        <p className="text-sm">No knowte selected.</p>
        <p className="text-xs">Add and process a knowte to generate flashcards.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)] space-y-2">
      <span className="text-4xl">🃏</span>
      <p className="text-sm font-medium text-[var(--text-secondary)]">No flashcards generated yet.</p>
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
      setError(e instanceof Error ? e.message : String(e));
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
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Flashcards"
          description="Review key terms using active recall cards."
        />
        <EmptyState reason="no-lecture" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Flashcards"
          description="Review key terms using active recall cards."
        />
        <FlashcardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Flashcards"
          description="Review key terms using active recall cards."
        />
        <div className="bg-[var(--color-error-muted)] border border-[var(--color-error-muted)] rounded-lg p-4 text-sm text-[var(--color-error)] shadow-sm">
          {error}
        </div>
        <button
          type="button"
          onClick={() => currentLectureId && void loadFlashcards(currentLectureId)}
          className="mt-4 rounded-md bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="mx-auto max-w-[900px] space-y-6">
        <ViewHeader
          title="Flashcards"
          description="Review key terms using active recall cards."
        />
        <EmptyState reason="no-flashcards" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6">
      <ViewHeader
        title="Flashcards"
        description={`${cards.length} cards generated`}
      />

      {/* Card Viewer */}
      <FlashcardViewer cards={cards} />

      {/* Export */}
      <AnkiExport lectureId={currentLectureId} cardCount={cards.length} />
    </div>
  );
}
