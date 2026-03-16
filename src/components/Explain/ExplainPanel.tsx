import { PERSONALIZATION_LEVELS, type ExplainHistoryEntry } from "../../lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X, Sparkles, Wand2, History, MessageSquareQuote } from "lucide-react";

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
      className={`print:hidden fixed right-0 top-10 z-65 h-[calc(100vh-2.5rem)] w-[380px] border-l border-border bg-card/95 shadow-2xl transition-transform duration-500 ease-in-out backdrop-blur-xl ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col">
        <header className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                <h2 className="font-heading text-lg font-bold leading-none">Explain This</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                AI contextual explanations for your notes
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onExplainSimpler}
              disabled={!canExplainSimpler || isBusy}
              className="flex-1 text-xs gap-1.5"
            >
              <Wand2 className="h-3 w-3" />
              Simpler
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onExplainDeeper}
              disabled={!canExplainDeeper || isBusy}
              className="flex-1 text-xs gap-1.5"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              Deeper
            </Button>
          </div>
        </header>

        <Separator />

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-6">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <MessageSquareQuote className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-balance text-muted-foreground max-w-[200px]">
                    Select text from Transcript or Notes to get an explanation.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {history.slice().reverse().map((entry) => (
                    <article
                      key={entry.id}
                      className="relative space-y-3 animate-in fade-in slide-in-from-right-4 duration-500"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                          <History className="h-3 w-3" />
                          {levelLabel(entry.level)}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {formatTimestamp(entry.createdAt)}
                        </span>
                      </div>

                      <blockquote className="relative rounded-lg border-l-4 border-primary/30 bg-muted/30 px-4 py-3 text-[13px] leading-relaxed text-foreground/80 italic">
                        "{entry.selectedText}"
                      </blockquote>

                      <div className="text-sm leading-relaxed text-foreground/90 selection:bg-primary/20">
                        {entry.explanation}
                        {entry.isStreaming && (
                          <span
                            aria-hidden
                            className="ml-1 inline-block h-4 w-1 animate-pulse rounded bg-primary align-middle"
                          />
                        )}
                      </div>
                      
                      {entry.error && (
                        <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                          {entry.error}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </aside>
  );
}
