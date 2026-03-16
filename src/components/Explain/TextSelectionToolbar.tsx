import { Button } from "@/components/ui/button";
import { Sparkles, Copy, Plus } from "lucide-react";

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
      className="print:hidden fixed z-70 -translate-x-1/2 -translate-y-full rounded-full border border-border bg-popover/95 p-1 shadow-xl backdrop-blur-md animate-in fade-in zoom-in duration-200"
      style={{ left: position.left, top: position.top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onExplain}
          disabled={disableActions}
          className="h-8 rounded-full px-3 text-xs gap-1.5 hover:bg-primary hover:text-primary-foreground"
        >
          <Sparkles className="h-3 w-3" />
          Explain
        </Button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddToFlashcards}
          disabled={disableActions}
          className="h-8 rounded-full px-3 text-xs gap-1.5 hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="h-3 w-3" />
          Flashcard
        </Button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          disabled={disableActions}
          className="h-8 rounded-full px-3 text-xs gap-1.5"
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
      </div>
    </div>
  );
}
