import { useCallback, useEffect, useState } from "react";
import { NotesSkeleton } from "../components/Skeletons";
import { NotesExport, StructuredNotesView } from "../components/Notes";
import { getNotes, regenerateNotes } from "../lib/tauriApi";
import type { StructuredNotes } from "../lib/types";
import { useLectureStore, useToastStore } from "../stores";

// ─── Table of Contents ────────────────────────────────────────────────────────

interface TocItem {
  id: string;
  label: string;
  level: "h1" | "h2";
}

function buildToc(notes: StructuredNotes, hasSummary: boolean): TocItem[] {
  const items: TocItem[] = [];

  if (hasSummary) {
    items.push({ id: "summary", label: "Summary", level: "h2" });
  }

  (notes.topics ?? []).forEach((topic, i) => {
    items.push({ id: `topic-${i}`, label: topic.heading, level: "h2" });
  });

  if ((notes.key_terms ?? []).length > 0) {
    items.push({ id: "key-terms", label: "Key Terms", level: "h2" });
  }

  if ((notes.takeaways ?? []).length > 0) {
    items.push({ id: "takeaways", label: "Key Takeaways", level: "h2" });
  }

  return items;
}

interface TableOfContentsProps {
  items: TocItem[];
  activeId: string | null;
}

function TableOfContents({ items, activeId }: TableOfContentsProps) {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <nav className="space-y-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Contents
      </p>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          className={`block w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
            activeId === item.id
              ? "text-violet-300 bg-violet-900/30 font-medium"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/40"
          } ${item.level === "h2" ? "pl-3" : "pl-5"}`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

// ─── Active section tracker ───────────────────────────────────────────────────

function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length === 0) return;

    const observers = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveId(id);
          }
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
      );
      observer.observe(el);
      return observer;
    });

    return () => {
      observers.forEach((o) => o?.disconnect());
    };
  }, [ids]);

  return activeId;
}

// ─── Empty / Loading States ───────────────────────────────────────────────────

function EmptyState({ reason }: { reason: "no-lecture" | "no-notes" }) {
  if (reason === "no-lecture") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
        <span className="text-4xl">📝</span>
        <p className="text-sm">No lecture selected.</p>
        <p className="text-xs">Upload and process a lecture to view notes.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
      <span className="text-4xl">📝</span>
      <p className="text-sm font-medium text-slate-300">No notes generated yet.</p>
      <p className="text-xs">Run the processing pipeline to generate structured notes.</p>
    </div>
  );
}

// ─── Notes Page ───────────────────────────────────────────────────────────────

export default function Notes() {
  const { currentLectureId, lectures } = useLectureStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const currentLecture = lectures.find((l) => l.id === currentLectureId) ?? null;

  const [notes, setNotes] = useState<StructuredNotes | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!currentLectureId) {
      setNotes(null);
      return;
    }

    setNotes(null);
    setError(null);
    setIsLoading(true);

    try {
      const raw = await getNotes(currentLectureId);
      if (!raw) {
        setNotes(null);
        return;
      }

      try {
        setNotes(JSON.parse(raw) as StructuredNotes);
      } catch {
        setError("Failed to parse notes data.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [currentLectureId]);

  // ── Load notes from backend ─────────────────────────────────────────────────
  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // ── Regenerate ──────────────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!currentLectureId || isRegenerating) return;
    setIsRegenerating(true);
    setError(null);

    try {
      const raw = await regenerateNotes(currentLectureId);
      if (raw) {
        setNotes(JSON.parse(raw) as StructuredNotes);
        pushToast({ kind: "success", message: "Notes regenerated successfully." });
      } else {
        pushToast({ kind: "warning", message: "Notes regeneration returned no data." });
      }
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to regenerate notes.");
      pushToast({ kind: "error", message: "Failed to regenerate notes." });
    } finally {
      setIsRegenerating(false);
    }
  }, [currentLectureId, isRegenerating, pushToast]);

  // ── ToC ─────────────────────────────────────────────────────────────────────
  const tocItems = notes ? buildToc(notes, Boolean(currentLecture?.summary)) : [];
  const tocIds = tocItems.map((item) => item.id);
  const activeId = useActiveSection(tocIds);

  // ── No lecture ──────────────────────────────────────────────────────────────
  if (!currentLectureId || !currentLecture) {
    return <EmptyState reason="no-lecture" />;
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-100">Lecture Notes</h1>
        <NotesSkeleton />
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100">Lecture Notes</h1>
        <div className="bg-red-950/40 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void loadNotes()}
          className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── No notes yet ────────────────────────────────────────────────────────────
  if (!notes) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-100">Lecture Notes</h1>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-4 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isRegenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating…
              </>
            ) : (
              <>✨ Generate Notes</>
            )}
          </button>
        </div>
        <EmptyState reason="no-notes" />
      </div>
    );
  }

  // ── Main view ───────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-6 h-full relative">
      {/* ── Sticky ToC sidebar ────────────────────────────────────────────── */}
      <aside className="hidden lg:block w-56 flex-shrink-0">
        <div className="sticky top-6">
          <TableOfContents items={tocItems} activeId={activeId} />
        </div>
      </aside>

      {/* ── Main document area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-5">
        {/* Page header */}
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-100">Lecture Notes</h1>
            <p className="text-sm text-slate-400 mt-0.5 truncate">
              {currentLecture.filename}
            </p>
          </div>

          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-slate-200 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
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
        </div>

        {/* Export bar */}
        <NotesExport
          lectureId={currentLectureId}
          notes={notes}
          summary={currentLecture.summary}
        />

        {/* Divider */}
        <div className="border-t border-slate-700" />

        {/* Notes document */}
        <StructuredNotesView notes={notes} summary={currentLecture.summary} />
      </div>
    </div>
  );
}
