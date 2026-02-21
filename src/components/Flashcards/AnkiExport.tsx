import { useState } from "react";
import { exportFlashcardsAnki, exportFlashcardsTsv } from "../../lib/tauriApi";
import { useToastStore } from "../../stores";

interface AnkiExportProps {
  lectureId: string;
  cardCount: number;
}

export default function AnkiExport({ lectureId, cardCount }: AnkiExportProps) {
  const pushToast = useToastStore((state) => state.pushToast);
  const [ankiState, setAnkiState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [tsvState, setTsvState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [ankiPath, setAnkiPath] = useState<string | null>(null);
  const [tsvPath, setTsvPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnkiExport = async () => {
    setAnkiState("loading");
    setError(null);
    try {
      const path = await exportFlashcardsAnki(lectureId);
      if (path) {
        setAnkiPath(path);
        setAnkiState("success");
        pushToast({ kind: "success", message: "Anki package exported successfully." });
      } else {
        // User cancelled the dialog
        setAnkiState("idle");
      }
    } catch (e) {
      setError(String(e));
      setAnkiState("error");
      pushToast({ kind: "error", message: "Failed to export Anki package." });
    }
  };

  const handleTsvExport = async () => {
    setTsvState("loading");
    setError(null);
    try {
      const path = await exportFlashcardsTsv(lectureId);
      if (path) {
        setTsvPath(path);
        setTsvState("success");
        pushToast({ kind: "success", message: "Flashcards text export completed." });
      } else {
        setTsvState("idle");
      }
    } catch (e) {
      setError(String(e));
      setTsvState("error");
      pushToast({ kind: "error", message: "Failed to export flashcards text file." });
    }
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-slate-200">Export</span>
        <span className="text-xs text-slate-500 bg-slate-700 rounded-full px-2 py-0.5">
          {cardCount} cards
        </span>
      </div>

      <div className="space-y-3">
        {/* Anki .apkg export */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-300">Anki Package (.apkg)</p>
            <p className="text-xs text-slate-500 truncate">
              Import directly into Anki desktop app
            </p>
          </div>
          <button
            onClick={handleAnkiExport}
            disabled={ankiState === "loading"}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              ankiState === "success"
                ? "bg-green-900/40 text-green-300 border border-green-800/50"
                : ankiState === "error"
                  ? "bg-red-900/40 text-red-300 border border-red-800/50"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {ankiState === "loading" ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Exporting…
              </>
            ) : ankiState === "success" ? (
              <>✓ Saved</>
            ) : ankiState === "error" ? (
              <>✗ Failed</>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export .apkg
              </>
            )}
          </button>
        </div>

        {ankiState === "success" && ankiPath && (
          <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2">
            <p className="text-xs text-green-300 font-medium">Saved to:</p>
            <p className="text-xs text-green-400/80 truncate font-mono mt-0.5">{ankiPath}</p>
            <p className="text-xs text-slate-400 mt-1.5">
              In Anki: <span className="text-slate-300 font-medium">File → Import</span> → select the .apkg file
            </p>
          </div>
        )}

        {/* TSV export */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-700/50">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-300">Tab-Separated (.txt)</p>
            <p className="text-xs text-slate-500 truncate">
              Import via Anki → File → Import (text format)
            </p>
          </div>
          <button
            onClick={handleTsvExport}
            disabled={tsvState === "loading"}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tsvState === "success"
                ? "bg-green-900/40 text-green-300 border border-green-800/50"
                : tsvState === "error"
                  ? "bg-red-900/40 text-red-300 border border-red-800/50"
                  : "bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {tsvState === "loading" ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Exporting…
              </>
            ) : tsvState === "success" ? (
              <>✓ Saved</>
            ) : tsvState === "error" ? (
              <>✗ Failed</>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export .txt
              </>
            )}
          </button>
        </div>

        {tsvState === "success" && tsvPath && (
          <div className="bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2">
            <p className="text-xs text-green-300 font-medium">Saved to:</p>
            <p className="text-xs text-green-400/80 truncate font-mono mt-0.5">{tsvPath}</p>
            <p className="text-xs text-slate-400 mt-1.5">
              In Anki: <span className="text-slate-300 font-medium">File → Import</span> → select the .txt file → ensure separator is Tab
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
