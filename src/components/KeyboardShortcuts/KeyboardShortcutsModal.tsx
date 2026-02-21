import { useEffect, useRef } from "react";
import { GLOBAL_SHORTCUTS, LECTURE_VIEW_SHORTCUTS } from "../../lib/hotkeys";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function renderKeys(keys: string) {
  return keys.split("+").map((part) => (
    <kbd
      key={`${keys}-${part}`}
      className="rounded px-2 py-0.5 text-xs font-semibold"
      style={{
        border: "1px solid var(--border-strong)",
        background: "var(--bg-surface-overlay)",
        color: "var(--text-primary)",
      }}
    >
      {part}
    </kbd>
  ));
}

export default function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-8 backdrop-blur-sm animate-view-in"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="card w-full max-w-3xl p-6 shadow-lg animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 id="keyboard-shortcuts-title" className="text-xl font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
              Keyboard Shortcuts
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Use these shortcuts to navigate and control Knowte faster.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
            className="btn-ghost"
          >
            Close
          </button>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Global
            </p>
            {GLOBAL_SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.keys}
                className="flex items-center justify-between gap-4 rounded-lg px-3 py-2"
                style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}
              >
                <div className="flex items-center gap-1">{renderKeys(shortcut.keys)}</div>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{shortcut.action}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Knowte Views
            </p>
            {LECTURE_VIEW_SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between gap-4 rounded-lg px-3 py-2"
                style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}
              >
                <div className="flex items-center gap-1">{renderKeys(`Ctrl+${shortcut.key}`)}</div>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{shortcut.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
