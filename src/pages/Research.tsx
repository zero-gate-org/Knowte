import { useCallback, useEffect, useState } from "react";
import { PaperSkeleton } from "../components/Skeletons";
import { PaperList } from "../components/Research";
import { getLecturePapers, searchRelatedPapers } from "../lib/tauriApi";
import type { Paper } from "../lib/types";
import { useLectureStore, useSettingsStore, useToastStore } from "../stores";

export default function Research() {
  const { currentLectureId, lectures } = useLectureStore();
  const { settings } = useSettingsStore();
  const pushToast = useToastStore((state) => state.pushToast);

  const currentLecture = lectures.find((l) => l.id === currentLectureId) ?? null;

  const [papers, setPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load saved papers on mount / lecture change
  useEffect(() => {
    if (!currentLectureId) return;

    let cancelled = false;
    setHasLoaded(false);
    setPapers([]);
    setError(null);

    getLecturePapers(currentLectureId)
      .then((saved) => {
        if (cancelled) return;
        if (saved && saved.length > 0) {
          setPapers(saved);
        }
        setHasLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setHasLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [currentLectureId]);

  const handleSearch = useCallback(async () => {
    if (!currentLectureId) return;
    setIsLoading(true);
    setError(null);
    try {
      const results = await searchRelatedPapers(currentLectureId);
      setPapers(results);
      pushToast({
        kind: "success",
        message: `Found ${results.length} related paper${results.length === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();
      const isNetworkFailure =
        lower.includes("request failed") ||
        lower.includes("timed out") ||
        lower.includes("connection") ||
        lower.includes("network");
      setError(
        isNetworkFailure
          ? "Research paper search requires internet access. Check your connection and retry."
          : message,
      );
      pushToast({
        kind: "error",
        message: "Paper search failed. Verify internet access and try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentLectureId, pushToast]);

  // ── No lecture selected ────────────────────────────────────────────────────
  if (!currentLectureId || !currentLecture) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-2">
        <span className="text-4xl">🔬</span>
        <p className="text-sm">No lecture selected.</p>
        <p className="text-xs">Upload and process a lecture to find related papers.</p>
      </div>
    );
  }

  // ── Research disabled in settings ──────────────────────────────────────────
  if (settings && !settings.enable_research) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-slate-100">Related Research</h1>
        <div className="flex flex-col items-center justify-center h-48 bg-slate-800 rounded-lg border border-slate-700 space-y-3 text-slate-500">
          <span className="text-3xl">📡</span>
          <p className="text-sm font-medium text-slate-300">Research paper search is disabled.</p>
          <p className="text-xs">
            Enable "Research paper search" in{" "}
            <span className="text-blue-400">Settings → Research</span> to find related papers.
          </p>
        </div>
      </div>
    );
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Related Research</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Papers related to{" "}
            <span className="text-slate-300 font-medium">{currentLecture.filename}</span>
            {" "}via Semantic Scholar
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">
          <span className="mt-0.5">⚠</span>
          <div>
            <p className="font-medium">Search failed</p>
            <p className="text-xs mt-0.5 text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void handleSearch()}
              className="mt-3 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-slate-600"
            >
              Retry Search
            </button>
          </div>
        </div>
      )}

      {/* Empty state — no papers yet */}
      {hasLoaded && papers.length === 0 && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center h-56 bg-slate-800 rounded-lg border border-slate-700 border-dashed space-y-4">
          <span className="text-4xl">📚</span>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-slate-300">No papers found yet.</p>
            <p className="text-xs text-slate-500">
              Make sure the pipeline has finished, then click the button below.
            </p>
          </div>
          <button
            onClick={handleSearch}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
          >
            Search for Papers
          </button>
        </div>
      )}

      {/* Paper list */}
      {papers.length > 0 && (
        <PaperList papers={papers} isLoading={isLoading} onRefresh={handleSearch} />
      )}

      {isLoading && papers.length === 0 && <PaperSkeleton />}

      {/* Internet disclaimer */}
      <p className="text-xs text-slate-600 pt-2">
        ✦ Paper data is fetched from the{" "}
        <a
          href="https://www.semanticscholar.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-500 hover:text-slate-400 underline"
        >
          Semantic Scholar
        </a>{" "}
        API — the only external network call made by this app.
      </p>
    </div>
  );
}
