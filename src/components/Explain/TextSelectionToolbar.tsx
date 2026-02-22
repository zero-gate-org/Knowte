interface ToolbarPosition {
  left: number;
  top: number;
}

interface TextSelectionToolbarProps {
  isVisible: boolean;
  position: ToolbarPosition | null;
  onExplain: () => void;
  onAddToFlashcards: () => void;
  onCopy: () => void;
  disableActions?: boolean;
}

export default function TextSelectionToolbar({
  isVisible,
  position,
  onExplain,
  onAddToFlashcards,
  onCopy,
  disableActions = false,
}: TextSelectionToolbarProps) {
  if (!isVisible || !position) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label="Selected text actions"
      className="print:hidden fixed z-[70] -translate-x-1/2 -translate-y-full rounded-xl border border-[var(--border-default)]/90 bg-[var(--bg-surface-overlay)]/95 p-1.5 shadow-2xl backdrop-blur"
      style={{ left: position.left, top: position.top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onExplain}
          disabled={disableActions}
          className="rounded-md bg-[var(--accent-primary)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Explain
        </button>
        <button
          type="button"
          onClick={onAddToFlashcards}
          disabled={disableActions}
          className="rounded-md bg-[var(--color-warning)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-warning)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add to Flashcards
        </button>
        <button
          type="button"
          onClick={onCopy}
          disabled={disableActions}
          className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Copy
        </button>
      </div>
    </div>
  );
}
