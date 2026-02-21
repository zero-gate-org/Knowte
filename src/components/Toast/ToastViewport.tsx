import { useEffect } from "react";
import { useToastStore } from "../../stores";

const AUTO_DISMISS_MS = 5000;

const TOAST_STYLES = {
  success: {
    container: "border-emerald-500/40 bg-emerald-900/80 text-emerald-50",
    badge: "bg-emerald-500/25 text-emerald-200",
    label: "Success",
  },
  warning: {
    container: "border-amber-500/40 bg-amber-900/80 text-amber-50",
    badge: "bg-amber-500/25 text-amber-200",
    label: "Warning",
  },
  error: {
    container: "border-red-500/40 bg-red-900/80 text-red-50",
    badge: "bg-red-500/25 text-red-200",
    label: "Error",
  },
  info: {
    container: "border-blue-500/40 bg-blue-900/80 text-blue-50",
    badge: "bg-blue-500/25 text-blue-200",
    label: "Info",
  },
} as const;

export default function ToastViewport() {
  const { toasts, dismissToast } = useToastStore();

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), AUTO_DISMISS_MS),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [toasts, dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.kind];
        return (
          <button
            key={toast.id}
            type="button"
            onClick={() => dismissToast(toast.id)}
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-left shadow-lg backdrop-blur-sm transition-opacity hover:opacity-95 ${style.container}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}
              >
                {toast.title ?? style.label}
              </span>
              <span className="text-xs text-white/75">Click to dismiss</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{toast.message}</p>
          </button>
        );
      })}
    </div>
  );
}
