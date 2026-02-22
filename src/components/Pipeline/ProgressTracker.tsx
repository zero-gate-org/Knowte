import { useEffect, useRef, useState } from "react";
import {
  regenerateMindmap,
  regenerateNotes,
  regenerateQuiz,
  startPipeline,
} from "../../lib/tauriApi";
import type { PipelineStage } from "../../lib/types";
import { useToastStore } from "../../stores";
import { usePipelineStore, PIPELINE_STAGE_DEFS, TOTAL_PIPELINE_STAGES } from "../../stores/pipelineStore";

// ─── Sub-components ───────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 animate-spin text-[var(--accent-primary)]"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function StageRow({
  stage,
  streamingPreview,
  sectionProgressText,
  isMutating,
  onRetry,
  onSkip,
}: {
  stage: PipelineStage;
  streamingPreview: string;
  sectionProgressText?: string;
  isMutating: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const statusColors: Record<string, string> = {
    pending: "border-[var(--border-strong)] bg-[var(--bg-elevated)]",
    running: "border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10",
    complete: "border-[var(--color-success-muted)] bg-[var(--color-success)]/5",
    error: "border-[var(--color-error-muted)] bg-[var(--color-error)]/5",
  };

  const iconColors: Record<string, string> = {
    pending: "text-[var(--text-muted)]",
    running: "text-[var(--accent-primary)]",
    complete: "text-[var(--color-success)]",
    error: "text-[var(--color-error)]",
  };

  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-all duration-300 ${statusColors[stage.status]}`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 ${iconColors[stage.status]}`}>
          {stage.status === "pending" && (
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="8" strokeWidth="2" />
            </svg>
          )}
          {stage.status === "running" && <SpinnerIcon />}
          {stage.status === "complete" && (
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {stage.status === "error" && (
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        <span
          className={`flex-1 text-sm font-medium ${
            stage.status === "pending"
              ? "text-[var(--text-muted)]"
              : stage.status === "complete"
                ? "text-[var(--color-success)]"
                : stage.status === "error"
                  ? "text-[var(--color-error)]"
                  : "text-[var(--text-secondary)]"
          }`}
        >
          {stage.label}
        </span>

        <span className="text-xs capitalize text-[var(--text-muted)]">
          {stage.status === "running" ? "In progress…" : stage.status}
        </span>
      </div>

      {sectionProgressText && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{sectionProgressText}</p>
      )}

      {/* Streaming preview while running */}
      {stage.status === "running" && streamingPreview && (
        <div className="mt-2 rounded border border-[var(--accent-primary)]/20 bg-[var(--bg-surface-overlay)] px-3 py-2">
          <p className="line-clamp-3 font-mono text-xs text-[var(--text-muted)]">{streamingPreview}</p>
        </div>
      )}

      {/* Result preview once complete */}
      {stage.status === "complete" && stage.preview && (
        <div className="mt-2 rounded border border-[var(--color-success)]/20 bg-[var(--bg-surface-overlay)]/40 px-3 py-1.5">
          <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{stage.preview}</p>
        </div>
      )}

      {/* Error message */}
      {stage.status === "error" && stage.error && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-[var(--color-error)]">{stage.error}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRetry}
              disabled={isMutating}
              className="rounded-md bg-[var(--color-error-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-error)] transition-colors hover:bg-[var(--color-error-muted)] disabled:opacity-50"
            >
              {isMutating ? "Retrying..." : "Retry"}
            </button>
            <button
              type="button"
              onClick={onSkip}
              disabled={isMutating}
              className="rounded-md bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border-strong)] disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProgressTrackerProps {
  lectureId: string | null;
  /** Called once when all stages have completed or errored. */
  onPipelineComplete?: () => void;
  className?: string;
}

export default function ProgressTracker({
  lectureId,
  onPipelineComplete,
  className,
}: ProgressTrackerProps) {
  const pushToast = useToastStore((state) => state.pushToast);

  // ── Read live pipeline progress from the global store ─────────────────────
  // The store is fed by global Tauri event listeners set up in App.tsx, so
  // state persists across page navigation and is never lost when this
  // component unmounts.
  const lectureState = usePipelineStore(
    (state) => (lectureId ? (state.lectureStates[lectureId] ?? null) : null),
  );
  const { updateStageStatus, bumpStagesComplete } = usePipelineStore.getState();

  // Only local state: the in-flight retry/skip action name (pure UI concern).
  const [stageActionName, setStageActionName] = useState<string | null>(null);

  // Derive display values; fall back to default pending state when the store
  // has no entry yet (e.g. very first render before any events arrive).
  const stages =
    lectureState?.stages ?? PIPELINE_STAGE_DEFS.map((s) => ({ ...s, status: "pending" as const }));
  const stagesComplete = lectureState?.stagesComplete ?? 0;
  const streamingTokens = lectureState?.streamingTokens ?? {};
  const sectionProgress = lectureState?.sectionProgress ?? {};
  const isDone = lectureState?.isDone ?? false;
  const pipelineWarning = lectureState?.pipelineWarning ?? null;

  // Fire onPipelineComplete once when isDone first flips to true for the
  // current lectureId. We use a ref so there's no extra render cycle.
  const completionFiredRef = useRef<{ lectureId: string | null; fired: boolean }>({
    lectureId: null,
    fired: false,
  });
  useEffect(() => {
    // Reset tracking whenever the lecture changes.
    if (completionFiredRef.current.lectureId !== lectureId) {
      completionFiredRef.current = { lectureId, fired: isDone };
      return;
    }
    if (isDone && !completionFiredRef.current.fired) {
      completionFiredRef.current.fired = true;
      onPipelineComplete?.();
    }
  }, [lectureId, isDone, onPipelineComplete]);

  if (!lectureId) return null;

  const progressPercent = Math.round((stagesComplete / TOTAL_PIPELINE_STAGES) * 100);

  const stageIndex = (stageName: string) =>
    PIPELINE_STAGE_DEFS.findIndex((s) => s.name === stageName);

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetryStage = async (stageName: string) => {
    if (!lectureId || stageActionName) return;

    setStageActionName(stageName);
    updateStageStatus(lectureId, stageName, "running", undefined, undefined);

    try {
      if (stageName === "notes") {
        const notes = await regenerateNotes(lectureId);
        if (!notes) throw new Error("No notes data returned.");
        updateStageStatus(lectureId, stageName, "complete", "Stage retried successfully.");
      } else if (stageName === "quiz") {
        const quiz = await regenerateQuiz(lectureId);
        if (!quiz) throw new Error("No quiz data returned.");
        updateStageStatus(lectureId, stageName, "complete", "Stage retried successfully.");
      } else if (stageName === "mindmap") {
        const mindmap = await regenerateMindmap(lectureId);
        if (!mindmap) throw new Error("No mind map data returned.");
        updateStageStatus(lectureId, stageName, "complete", "Stage retried successfully.");
      } else {
        await startPipeline(lectureId);
        pushToast({
          kind: "info",
          message: `Retrying ${stageName} by restarting the remaining pipeline stages.`,
        });
      }

      const index = stageIndex(stageName);
      if (index >= 0) bumpStagesComplete(lectureId, index + 1);
      pushToast({ kind: "success", message: `Retried "${stageName}" stage.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStageStatus(lectureId, stageName, "error", undefined, message);
      pushToast({ kind: "error", message: `Failed to retry "${stageName}": ${message}` });
    } finally {
      setStageActionName(null);
    }
  };

  // ── Skip ──────────────────────────────────────────────────────────────────
  const handleSkipStage = (stageName: string) => {
    updateStageStatus(lectureId, stageName, "complete", "Skipped by user.");
    const index = stageIndex(stageName);
    if (index >= 0) bumpStagesComplete(lectureId, index + 1);
    pushToast({ kind: "warning", message: `Skipped "${stageName}" stage.` });
  };

  return (
    <section className={`space-y-4 ${className ?? ""}`}>
      {pipelineWarning && (
        <div className="rounded-lg border border-[var(--color-warning-muted)] bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--color-warning)]">
          {pipelineWarning}
        </div>
      )}

      {/* Overall progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 overflow-hidden rounded-full bg-[var(--bg-elevated)] h-2">
          <div
            className="h-full rounded-full bg-[var(--accent-primary)] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="min-w-[3rem] text-right text-xs text-[var(--text-muted)] tabular-nums">
          {progressPercent}%
        </span>
      </div>

      {/* Stage list */}
      <div className="space-y-2">
        {stages.map((stage) => {
          const section = sectionProgress[stage.name];
          const sectionProgressText = section
            ? `Sections ${section.completed.length}/${section.total}${section.running ? ` • processing ${section.running}` : ""}`
            : undefined;
          return (
            <StageRow
              key={stage.name}
              stage={stage}
              streamingPreview={streamingTokens[stage.name] ?? ""}
              sectionProgressText={sectionProgressText}
              isMutating={stageActionName === stage.name}
              onRetry={() => void handleRetryStage(stage.name)}
              onSkip={() => handleSkipStage(stage.name)}
            />
          );
        })}
      </div>

      {isDone && (
        <div className="rounded-lg border border-[var(--color-success-muted)] bg-[var(--color-success-muted)] px-4 py-3 text-sm font-medium text-[var(--color-success)]">
          All stages complete! Your results are ready to view.
        </div>
      )}
    </section>
  );
}
