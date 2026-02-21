import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThemeMode } from "../../lib/types";

interface TitleBarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export default function TitleBar({
  theme,
  onToggleTheme,
}: TitleBarProps) {
  const isNative = isTauri();
  const nativeWindow = useMemo(
    () => (isNative ? getCurrentWindow() : null),
    [isNative],
  );
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!nativeWindow) {
      return;
    }

    let isMounted = true;
    let unlistenResized: (() => void) | null = null;

    const syncMaximized = async () => {
      const maximized = await nativeWindow.isMaximized();
      if (isMounted) {
        setIsMaximized(maximized);
      }
    };

    void syncMaximized();

    void nativeWindow.onResized(() => {
      void syncMaximized();
    }).then((unlisten) => {
      unlistenResized = unlisten;
    });

    return () => {
      isMounted = false;
      unlistenResized?.();
    };
  }, [nativeWindow]);

  const handleMinimize = useCallback(async () => {
    if (!nativeWindow) {
      return;
    }
    try {
      await nativeWindow.minimize();
    } catch (error) {
      console.error("Failed to minimize window:", error);
    }
  }, [nativeWindow]);

  const handleToggleMaximize = useCallback(async () => {
    if (!nativeWindow) {
      return;
    }
    try {
      await nativeWindow.toggleMaximize();
      setIsMaximized(await nativeWindow.isMaximized());
    } catch (error) {
      console.error("Failed to toggle maximize:", error);
    }
  }, [nativeWindow]);

  const handleClose = useCallback(async () => {
    if (!nativeWindow) {
      return;
    }
    try {
      await nativeWindow.close();
    } catch (error) {
      console.error("Failed to close window:", error);
    }
  }, [nativeWindow]);

  return (
    <header
      className="flex h-11 items-center justify-between px-3 backdrop-blur-sm"
      style={{
        background: "var(--bg-surface-overlay)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      <div className="flex min-w-0 items-center gap-3" data-tauri-drag-region>
        <img src="/Knowte.png" alt="Knowte app icon" className="h-8 w-16 shrink-0" />
        <p
          className="truncate text-xs font-semibold tracking-widest"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
          data-tauri-drag-region
        >
          KNOWTE
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Theme toggle button */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-all duration-200 hover:scale-110"
          style={{
            color: "var(--text-tertiary)",
            background: "var(--bg-muted)",
            border: "1px solid var(--border-default)",
          }}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        >
          {theme === "dark" ? (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" style={{ color: "var(--accent-secondary)" }}>
              <path d="M12 4.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V5.25A.75.75 0 0 1 12 4.5zm0 12a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75zm7.5-4.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75zM8.25 12a.75.75 0 0 1-.75.75H6a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75zm7.273-4.773a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06zM6.297 16.453a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 0-1.06zm11.346 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 1.06-1.06l1.06 1.06zM8.417 7.227a.75.75 0 1 1-1.06 1.06l-1.06-1.06a.75.75 0 0 1 1.06-1.06l1.06 1.06zM12 8.25a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5z" />
            </svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" style={{ color: "var(--accent-primary)" }}>
              <path d="M12.996 2a.75.75 0 0 1 .721.954 8.25 8.25 0 1 0 7.33 10.323.75.75 0 0 1 1.423-.073A9.75 9.75 0 1 1 12.275 2.279a.75.75 0 0 1 .721-.279z" />
            </svg>
          )}
        </button>

        {isNative && (
          <div className="ml-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleMinimize()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors"
              style={{
                color: "var(--text-tertiary)",
                background: "var(--bg-muted)",
                border: "1px solid var(--border-default)",
              }}
              aria-label="Minimize window"
            >
              <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M2 6h8" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void handleToggleMaximize()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors"
              style={{
                color: "var(--text-tertiary)",
                background: "var(--bg-muted)",
                border: "1px solid var(--border-default)",
              }}
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
            >
              {isMaximized ? (
                <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.2}>
                  <rect x="2" y="4" width="6" height="6" rx="1" />
                  <path d="M4 4V3a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H9" />
                </svg>
              ) : (
                <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.2}>
                  <rect x="2" y="2" width="8" height="8" rx="1" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handleClose()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors"
              style={{
                color: "var(--color-error)",
                background: "var(--color-error-subtle)",
                border: "1px solid transparent",
              }}
              aria-label="Close window"
            >
              <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
