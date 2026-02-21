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
      className="rounded border border-slate-500 bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-100"
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        className="w-full max-w-3xl rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 id="keyboard-shortcuts-title" className="text-xl font-semibold text-slate-100">
              Keyboard Shortcuts
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Use these shortcuts to navigate and control Cognote faster.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts dialog"
            className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700"
          >
            Close
          </button>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Global
            </p>
            {GLOBAL_SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.keys}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2"
              >
                <div className="flex items-center gap-1">{renderKeys(shortcut.keys)}</div>
                <span className="text-sm text-slate-300">{shortcut.action}</span>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Lecture Views
            </p>
            {LECTURE_VIEW_SHORTCUTS.map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2"
              >
                <div className="flex items-center gap-1">{renderKeys(`Ctrl+${shortcut.key}`)}</div>
                <span className="text-sm text-slate-300">{shortcut.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
