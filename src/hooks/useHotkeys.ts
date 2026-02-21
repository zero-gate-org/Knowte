import { useEffect } from "react";

export interface HotkeyHandlers {
  onNewLecture: () => void;
  onNavigateLectureView: (viewNumber: number) => void;
  onOpenSettings: () => void;
  onGoHome: () => void;
  onEscape: () => void;
  onToggleAudioPlayback: () => boolean;
  onPreviousItem: () => boolean;
  onNextItem: () => boolean;
  onExportCurrentView: () => boolean;
  onShowShortcuts: () => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (target.getAttribute("role") === "textbox") {
    return true;
  }

  return false;
}

export function useHotkeys({
  onNewLecture,
  onNavigateLectureView,
  onOpenSettings,
  onGoHome,
  onEscape,
  onToggleAudioPlayback,
  onPreviousItem,
  onNextItem,
  onExportCurrentView,
  onShowShortcuts,
}: HotkeyHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const key = event.key;
      const keyLower = key.toLowerCase();
      const hasModifier = event.ctrlKey || event.metaKey;

      if (hasModifier && !event.altKey) {
        if (event.shiftKey && keyLower === "e") {
          if (onExportCurrentView()) {
            event.preventDefault();
          }
          return;
        }

        if (!event.shiftKey && keyLower === "n") {
          event.preventDefault();
          onNewLecture();
          return;
        }

        if (!event.shiftKey && keyLower === "h") {
          event.preventDefault();
          onGoHome();
          return;
        }

        if (!event.shiftKey && key === ",") {
          event.preventDefault();
          onOpenSettings();
          return;
        }

        if (!event.shiftKey && /^[1-7]$/.test(key)) {
          event.preventDefault();
          onNavigateLectureView(Number(key));
          return;
        }
      }

      if (key === "Escape") {
        onEscape();
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (!hasModifier && !event.altKey) {
        if (key === "?" || (key === "/" && event.shiftKey)) {
          event.preventDefault();
          onShowShortcuts();
          return;
        }

        if (key === " " || key === "Spacebar" || event.code === "Space") {
          if (onToggleAudioPlayback()) {
            event.preventDefault();
          }
          return;
        }

        if (key === "ArrowLeft") {
          if (onPreviousItem()) {
            event.preventDefault();
          }
          return;
        }

        if (key === "ArrowRight" && onNextItem()) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onEscape,
    onExportCurrentView,
    onGoHome,
    onNavigateLectureView,
    onNewLecture,
    onNextItem,
    onOpenSettings,
    onPreviousItem,
    onShowShortcuts,
    onToggleAudioPlayback,
  ]);
}
