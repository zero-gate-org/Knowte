import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  estimatePipelineWork,
  startPipelineWithOptions,
  transcribeAudio,
} from "../../lib/tauriApi";
import type {
  AudioFileMetadata,
  Lecture,
  PipelineStageEvent,
  TranscriptionProgress,
} from "../../lib/types";
import { useLectureStore, useToastStore } from "../../stores";
import { ViewHeader } from "../Layout";
import DropZone from "./DropZone";
import LiveRecorder from "./LiveRecorder";

type UploadTab = "upload" | "record";
type QueueStatus = "waiting" | "processing" | "complete" | "error";

interface QueueItem {
  lectureId: string;
  metadata: AudioFileMetadata;
  status: QueueStatus;
  error?: string;
}

const formatDuration = (durationSeconds: number) => {
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = Math.floor(durationSeconds % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

const formatSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = sizeBytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

const toLecture = (metadata: AudioFileMetadata): Lecture => ({
  id: metadata.id,
  title: metadata.filename,
  filename: metadata.filename,
  audioPath: metadata.path,
  duration: metadata.duration_seconds,
  status: "uploaded",
  createdAt: new Date().toISOString(),
});

function statusBadgeClass(status: QueueStatus): string {
  if (status === "complete") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-200";
  }
  if (status === "processing") {
    return "border-blue-500/40 bg-blue-500/15 text-blue-200";
  }
  if (status === "error") {
    return "border-red-500/40 bg-red-500/15 text-red-200";
  }
  return "border-slate-500/40 bg-slate-500/15 text-slate-200";
}

export default function AudioUploader() {
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [activeQueueLectureId, setActiveQueueLectureId] = useState<string | null>(null);
  const [processHint, setProcessHint] = useState<string | null>(null);
  const [transcriptionProgress, setTranscriptionProgress] = useState<
    Record<string, TranscriptionProgress>
  >({});
  const pushToast = useToastStore((state) => state.pushToast);

  const {
    addLecture,
    setCurrentLecture,
    updateLecture,
    isUploading,
    isRecording,
    isProcessingLecture,
    error,
    setUploading,
    setRecording,
    setProcessingLecture,
    setError,
  } = useLectureStore();

  const waitingCount = useMemo(
    () => queueItems.filter((item) => item.status === "waiting").length,
    [queueItems],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<TranscriptionProgress>("transcription-progress", (event) => {
      const payload = event.payload;
      setTranscriptionProgress((current) => ({
        ...current,
        [payload.lecture_id]: payload,
      }));
    })
      .then((unsubscribe) => {
        unlisten = unsubscribe;
      })
      .catch(() => {});

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const hasQueueItems = queueItems.length > 0;

  const formatEta = (seconds: number | null | undefined) => {
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
      return null;
    }

    const rounded = Math.round(seconds);
    const mins = Math.floor(rounded / 60);
    const secs = rounded % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const waitForPipelineCompletion = useCallback((lectureId: string) => {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let unlisten: (() => void) | null = null;

      const timeout = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        if (unlisten) {
          unlisten();
        }
        reject(new Error("Pipeline timed out before completion."));
      }, 25 * 60 * 1000);

      const cleanup = () => {
        window.clearTimeout(timeout);
        if (unlisten) {
          unlisten();
          unlisten = null;
        }
      };

      void listen<PipelineStageEvent>("pipeline-stage", (event) => {
        const payload = event.payload;
        if (payload.lecture_id !== lectureId) {
          return;
        }

        if (payload.stage === "pipeline" && payload.status === "complete") {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve();
        }
      })
        .then((unsubscribe) => {
          unlisten = unsubscribe;
        })
        .catch((listenError) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(listenError);
        });
    });
  }, []);

  const handleAudioSuccess = (batch: AudioFileMetadata[]) => {
    if (batch.length === 0) {
      return;
    }

    for (const metadata of batch) {
      addLecture(toLecture(metadata));
    }

    const latestId = batch[batch.length - 1]?.id;
    if (latestId) {
      setCurrentLecture(latestId);
    }

    setQueueItems((current) => {
      const existingIds = new Set(current.map((item) => item.lectureId));
      const next = [...current];
      for (const metadata of batch) {
        if (!existingIds.has(metadata.id)) {
          next.push({
            lectureId: metadata.id,
            metadata,
            status: "waiting",
          });
        }
      }
      return next;
    });

    setProcessHint(null);
    setError(null);
    pushToast({
      kind: "success",
      message:
        batch.length === 1
          ? `Imported "${batch[0].filename}".`
          : `Imported ${batch.length} files to the processing queue.`,
    });
  };

  const removeQueueItem = (lectureId: string) => {
    if (isBatchRunning) {
      return;
    }

    setQueueItems((current) =>
      current.filter((item) => item.lectureId !== lectureId || item.status !== "waiting"),
    );
  };

  const updateQueueStatus = (lectureId: string, status: QueueStatus, message?: string) => {
    setQueueItems((current) =>
      current.map((item) =>
        item.lectureId === lectureId
          ? {
              ...item,
              status,
              error: message,
            }
          : item,
      ),
    );
  };

  const handleProcessAll = async () => {
    if (isBatchRunning || waitingCount === 0) {
      return;
    }

    const queueSnapshot = queueItems.filter((item) => item.status === "waiting");
    if (queueSnapshot.length === 0) {
      return;
    }

    setIsBatchRunning(true);
    setProcessingLecture(true);
    setError(null);
    let completedCount = 0;

    try {
      for (const item of queueSnapshot) {
        const lectureId = item.lectureId;
        const filename = item.metadata.filename;

        setActiveQueueLectureId(lectureId);
        updateQueueStatus(lectureId, "processing", undefined);
        setProcessHint(`Transcribing ${filename}...`);
        updateLecture(lectureId, { status: "transcribing", error: undefined });

        try {
          const transcription = await transcribeAudio(lectureId);
          updateLecture(lectureId, {
            status: "processing",
            transcriptId: transcription.transcript_id,
            transcript: transcription.full_text,
            transcriptSegments: transcription.segments,
            originalTranscriptSegments: transcription.segments.map((segment) => ({ ...segment })),
            error: undefined,
          });
          setCurrentLecture(lectureId);

          const estimate = await estimatePipelineWork(lectureId);
          const estimateMessage = `This lecture will process ~${estimate.token_estimate.toLocaleString()} tokens (estimated ${estimate.estimated_minutes_min}-${estimate.estimated_minutes_max} min).`;
          let useCache = true;
          if (estimate.has_cached_results) {
            useCache = window.confirm(
              `${estimateMessage}\n\nCached results are available for ${estimate.cached_stage_count} stage(s).\n\nPress OK to use cached results, or Cancel to regenerate everything.`,
            );
          }

          setProcessHint(
            `${estimateMessage} Running AI pipeline for ${filename} (${useCache ? "cache enabled" : "regenerating"}).`,
          );
          await startPipelineWithOptions(lectureId, { useCache });
          await waitForPipelineCompletion(lectureId);

          updateLecture(lectureId, { status: "complete", error: undefined });
          updateQueueStatus(lectureId, "complete", undefined);
          completedCount += 1;
        } catch (processError) {
          const message = processError instanceof Error ? processError.message : String(processError);
          updateLecture(lectureId, { status: "error", error: message });
          updateQueueStatus(lectureId, "error", message);
          setError(message);
          pushToast({ kind: "error", message: `${filename}: ${message}` });
        }
      }
    } finally {
      setActiveQueueLectureId(null);
      setProcessHint(null);
      setIsBatchRunning(false);
      setProcessingLecture(false);
      pushToast({
        kind: completedCount === queueSnapshot.length ? "success" : "info",
        message: `Batch processing finished (${completedCount}/${queueSnapshot.length} complete).`,
      });
    }
  };

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <ViewHeader
        title="Audio Input"
        description="Upload multiple lecture files or record directly from your microphone."
      />

      <div
        className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-sm"
        role="tablist"
        aria-label="Audio input modes"
      >
        <button
          type="button"
          id="upload-tab"
          role="tab"
          aria-selected={activeTab === "upload"}
          aria-controls="audio-input-panel"
          onClick={() => setActiveTab("upload")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "upload"
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          Upload Files
        </button>
        <button
          type="button"
          id="record-tab"
          role="tab"
          aria-selected={activeTab === "record"}
          aria-controls="audio-input-panel"
          onClick={() => setActiveTab("record")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "record"
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          Record Live
        </button>
      </div>

      <section
        id="audio-input-panel"
        role="tabpanel"
        aria-labelledby={activeTab === "upload" ? "upload-tab" : "record-tab"}
        className="rounded-lg border border-slate-700 bg-slate-800/70 p-4 shadow-sm"
      >
        {activeTab === "upload" ? (
          <DropZone
            onUploadSuccess={handleAudioSuccess}
            onUploadStateChange={setUploading}
            disabled={isRecording || isProcessingLecture}
          />
        ) : (
          <LiveRecorder
            onRecordingSaved={(metadata) => handleAudioSuccess([metadata])}
            onRecordingStateChange={setRecording}
            disabled={isUploading || isProcessingLecture}
          />
        )}
      </section>

      {(isUploading || isRecording) && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {isUploading ? "Importing audio files..." : "Recording in progress..."}
        </div>
      )}

      {isProcessingLecture && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {processHint ?? "Processing queue..."}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {hasQueueItems && (
        <section className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Batch Queue</h2>
              <p className="text-sm text-slate-400">
                {waitingCount > 0
                  ? `${waitingCount} lecture${waitingCount === 1 ? "" : "s"} waiting to process.`
                  : "No waiting lectures in queue."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleProcessAll()}
              disabled={isUploading || isRecording || isBatchRunning || waitingCount === 0}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBatchRunning ? "Processing Queue..." : "Process All"}
            </button>
          </div>

          <ul className="space-y-2">
            {queueItems.map((item) => (
              <li
                key={item.lectureId}
                className="rounded-md border border-slate-700 bg-slate-900/60 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="break-all text-sm font-medium text-slate-100">
                      {item.metadata.filename}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDuration(item.metadata.duration_seconds)} / {formatSize(item.metadata.size_bytes)}
                    </p>
                    <p className="break-all text-xs text-slate-500">{item.metadata.path}</p>
                    {item.error && <p className="text-xs text-red-300">{item.error}</p>}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeQueueItem(item.lectureId)}
                      disabled={isBatchRunning || item.status !== "waiting"}
                      className="rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {activeQueueLectureId === item.lectureId && item.status === "processing" && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-blue-300">Currently processing...</p>
                    {transcriptionProgress[item.lectureId] && (
                      <p className="text-xs text-slate-300">
                        Transcription {transcriptionProgress[item.lectureId].percent}%{" "}
                        {typeof transcriptionProgress[item.lectureId].chunk_index === "number" &&
                        typeof transcriptionProgress[item.lectureId].chunk_total === "number"
                          ? `• chunk ${transcriptionProgress[item.lectureId].chunk_index}/${transcriptionProgress[item.lectureId].chunk_total}`
                          : ""}
                        {typeof transcriptionProgress[item.lectureId].chunk_percent === "number"
                          ? ` • segment ${Math.round(transcriptionProgress[item.lectureId].chunk_percent ?? 0)}%`
                          : ""}
                        {formatEta(transcriptionProgress[item.lectureId].eta_seconds) ? ` • ETA ${formatEta(transcriptionProgress[item.lectureId].eta_seconds)}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
