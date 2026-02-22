import { PERSONALIZATION_LEVELS, type ExplainHistoryEntry } from "../../lib/types";

interface ExplainPanelProps {
  isOpen: boolean;
  history: ExplainHistoryEntry[];
  canExplainSimpler: boolean;
  canExplainDeeper: boolean;
  isBusy: boolean;
  onExplainSimpler: () => void;
  onExplainDeeper: () => void;
  onClose: () => void;
}

function levelLabel(level: string): string {
  return PERSONALIZATION_LEVELS.find((item) => item.value === level)?.label ?? level;
}

function formatTimestamp(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ExplainPanel({
  isOpen,
  history,
  canExplainSimpler,
  canExplainDeeper,
  isBusy,
  onExplainSimpler,
  onExplainDeeper,
  onClose,
}: ExplainPanelProps) {
  return (
    <aside
      aria-hidden={!isOpen}
      className={`print:hidden fixed right-0 top-10 z-[65] h-[calc(100vh-2.5rem)] w-[350px] border-l border-[var(--border-default)]/80 bg-[var(--bg-surface-overlay)]/95 shadow-2xl transition-transform duration-300 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col">
        <header className="border-b border-[var(--border-default)]/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Explain This</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Contextual explanations for selected text
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-[var(--border-strong)] px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onExplainSimpler}
              disabled={!canExplainSimpler || isBusy}
              className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Explain simpler
            </button>
            <button
              type="button"
              onClick={onExplainDeeper}
              disabled={!canExplainDeeper || isBusy}
              className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Explain deeper
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <p className="rounded-lg border border-[var(--border-default)]/70 bg-[var(--bg-elevated)] p-3 text-xs text-[var(--text-muted)]">
              Select text from Transcript or Notes and choose Explain.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-xl border border-[var(--border-default)]/80 bg-[var(--bg-elevated)]/55 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>{levelLabel(entry.level)}</span>
                    <span>{formatTimestamp(entry.createdAt)}</span>
                  </div>
                  <blockquote className="rounded-md border-l-2 border-[var(--accent-primary)]/70 bg-[var(--bg-surface-overlay)]/70 px-3 py-2 text-xs italic text-[var(--text-secondary)]">
                    "{entry.selectedText}"
                  </blockquote>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                    {entry.explanation}
                    {entry.isStreaming && (
                      <span
                        aria-hidden
                        className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-[var(--accent-primary)] align-middle"
                      />
                    )}
                  </div>
                  {entry.error && (
                    <p className="mt-2 text-xs text-[var(--color-error)]">{entry.error}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
