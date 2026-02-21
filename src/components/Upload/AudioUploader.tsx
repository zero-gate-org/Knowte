import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  estimatePipelineWork,
  importYoutubeAudio,
  startPipelineWithOptions,
  transcribeAudio,
} from "../../lib/tauriApi";
import type {
  AudioFileMetadata,
  Lecture,
  LectureSourceType,
  PipelineStageEvent,
  TranscriptionProgress,
  YoutubeImportProgress,
} from "../../lib/types";
import { useLectureStore, useToastStore } from "../../stores";
import { ViewHeader } from "../Layout";
import DropZone, { type UploadStageUpdate } from "./DropZone";
import LiveRecorder from "./LiveRecorder";

type UploadTab = "upload" | "record";
type QueueStatus = "importing" | "waiting" | "processing" | "complete" | "error";
type QueueOrigin = "local" | "youtube";
type QueueStage =
  | "uploading"
  | "validating url"
  | "downloading"
  | "extracting audio"
  | "waiting"
  | "transcribing"
  | "processing"
  | "complete"
  | "error";

interface QueueItem {
  queueId: string;
  lectureId?: string;
  metadata?: AudioFileMetadata;
  filename: string;
  sourcePath: string;
  sourceType: LectureSourceType;
  origin: QueueOrigin;
  status: QueueStatus;
  stage: QueueStage;
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
  sourceType: metadata.source_type,
  duration: metadata.duration_seconds,
  status: "uploaded",
  createdAt: new Date().toISOString(),
});

function statusBadgeClass(status: QueueStatus): string {
  if (status === "complete") {
    return "badge-success";
  }
  if (status === "processing") {
    return "badge-info";
  }
  if (status === "importing") {
    return "badge-warning";
  }
  if (status === "error") {
    return "badge-error";
  }
  return "badge-neutral";
}

function sourceBadgeClass(origin: QueueOrigin, sourceType: LectureSourceType): string {
  if (origin === "youtube") {
    return "badge-error";
  }
  if (sourceType === "video") {
    return "badge-accent";
  }

  return "badge-info";
}

function sourceLabel(origin: QueueOrigin, sourceType: LectureSourceType): string {
  if (origin === "youtube") {
    return "YouTube";
  }
  return sourceType === "video" ? "Video" : "Audio";
}

function stageLabel(stage: QueueStage): string {
  if (stage === "validating url") return "Validating URL";
  if (stage === "downloading") return "Downloading";
  if (stage === "extracting audio") return "Extracting Audio";
  if (stage === "transcribing") return "Transcribing";
  if (stage === "processing") return "Processing";
  if (stage === "uploading") return "Uploading";
  if (stage === "waiting") return "Waiting";
  if (stage === "complete") return "Complete";
  return "Error";
}

function isValidYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (!["https:", "http:"].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const isYouTubeHost =
      host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
    if (!isYouTubeHost) {
      return false;
    }

    if (host === "youtu.be") {
      return parsed.pathname.replace(/\//g, "").trim().length > 0;
    }

    return (
      parsed.searchParams.has("v") ||
      parsed.pathname.startsWith("/shorts/") ||
      parsed.pathname.startsWith("/live/") ||
      parsed.pathname.startsWith("/embed/") ||
      parsed.pathname.startsWith("/watch")
    );
  } catch {
    return false;
  }
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
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [isYoutubeImporting, setIsYoutubeImporting] = useState(false);
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
    () => queueItems.filter((item) => item.status === "waiting" && Boolean(item.lectureId)).length,
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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<YoutubeImportProgress>("youtube-import-progress", (event) => {
      const payload = event.payload;
      const stage =
        payload.stage === "validating_url"
          ? "validating url"
          : payload.stage === "downloading"
            ? "downloading"
            : payload.stage === "extracting_audio"
              ? "extracting audio"
              : payload.stage === "ready"
                ? "waiting"
                : "error";

      setQueueItems((current) => {
        const index = current.findIndex(
          (item) =>
            item.origin === "youtube" &&
            item.status === "importing" &&
            item.sourcePath === payload.url,
        );
        if (index < 0) {
          return current;
        }

        const next = [...current];
        const existing = next[index];
        next[index] = {
          ...existing,
          stage,
          status: stage === "error" ? "error" : existing.status,
          error: stage === "error" ? payload.message ?? existing.error : undefined,
        };
        return next;
      });
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

  const handleUploadStageChange = useCallback((update: UploadStageUpdate) => {
    setQueueItems((current) => {
      const index = current.findIndex((item) => item.queueId === update.key);
      const next = [...current];
      const existing =
        index >= 0
          ? next[index]
          : {
              queueId: update.key,
              filename: update.filename,
              sourcePath: update.filePath,
              sourceType: update.sourceType,
              origin: "local" as QueueOrigin,
              status: "importing" as QueueStatus,
              stage: "uploading" as QueueStage,
            };

      let queueId = existing.queueId;
      let lectureId = existing.lectureId;
      let metadata = existing.metadata;
      let filename = existing.filename;
      let sourcePath = existing.sourcePath;
      let sourceType = existing.sourceType;
      let origin = existing.origin;
      let status = existing.status;
      let stage = existing.stage;
      let errorMessage = update.error;

      if (update.stage === "uploading") {
        status = "importing";
        stage = "uploading";
        filename = update.filename;
        sourcePath = update.filePath;
        sourceType = update.sourceType;
        origin = "local";
      } else if (update.stage === "extracting_audio") {
        status = "importing";
        stage = "extracting audio";
      } else if (update.stage === "ready" && update.metadata) {
        queueId = update.metadata.id;
        lectureId = update.metadata.id;
        metadata = update.metadata;
        filename = update.metadata.filename;
        sourcePath = update.metadata.path;
        sourceType = update.metadata.source_type;
        status = "waiting";
        stage = "waiting";
        errorMessage = undefined;
      } else if (update.stage === "error") {
        status = "error";
        stage = "error";
      }

      const nextItem: QueueItem = {
        queueId,
        lectureId,
        metadata,
        filename,
        sourcePath,
        sourceType,
        origin,
        status,
        stage,
        error: errorMessage,
      };

      if (index >= 0) {
        next[index] = nextItem;
      } else {
        next.push(nextItem);
      }

      return next;
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
      const existingIds = new Set(
        current.map((item) => item.lectureId).filter((id): id is string => Boolean(id)),
      );
      const next = [...current];
      for (const metadata of batch) {
        if (!existingIds.has(metadata.id)) {
          next.push({
            queueId: metadata.id,
            lectureId: metadata.id,
            metadata,
            filename: metadata.filename,
            sourcePath: metadata.path,
            sourceType: metadata.source_type,
            origin: "local",
            status: "waiting",
            stage: "waiting",
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

  const updateYoutubeQueueItem = useCallback(
    (
      queueId: string,
      updates: Partial<
        Pick<
          QueueItem,
          "queueId" | "status" | "stage" | "error" | "lectureId" | "metadata" | "filename" | "sourcePath"
        >
      >,
    ) => {
      setQueueItems((current) =>
        current.map((item) =>
          item.queueId === queueId
            ? {
                ...item,
                ...updates,
              }
            : item,
        ),
      );
    },
    [],
  );

  const handleYoutubeImport = useCallback(async () => {
    const url = youtubeUrl.trim();
    if (!isValidYouTubeUrl(url)) {
      setYoutubeError("Enter a valid YouTube URL (youtube.com or youtu.be).");
      return;
    }

    if (isUploading || isRecording || isProcessingLecture || isYoutubeImporting) {
      return;
    }

    const queueId = `youtube:${Date.now()}`;
    setYoutubeError(null);
    setError(null);
    setIsYoutubeImporting(true);
    setUploading(true);
    setQueueItems((current) => [
      ...current,
      {
        queueId,
        filename: url,
        sourcePath: url,
        sourceType: "audio",
        origin: "youtube",
        status: "importing",
        stage: "validating url",
      },
    ]);

    try {
      const metadata = await importYoutubeAudio(url);
      updateYoutubeQueueItem(queueId, {
        queueId: metadata.id,
        lectureId: metadata.id,
        metadata,
        filename: metadata.filename,
        sourcePath: metadata.path,
        status: "waiting",
        stage: "waiting",
        error: undefined,
      });
      handleAudioSuccess([metadata]);
      setYoutubeUrl("");
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : String(importError);
      updateYoutubeQueueItem(queueId, {
        status: "error",
        stage: "error",
        error: message,
      });
      setYoutubeError(message);
      setError(message);
      pushToast({
        kind: "error",
        message,
      });
    } finally {
      setIsYoutubeImporting(false);
      setUploading(false);
    }
  }, [
    handleAudioSuccess,
    isProcessingLecture,
    isRecording,
    isUploading,
    isYoutubeImporting,
    pushToast,
    setError,
    setUploading,
    updateYoutubeQueueItem,
    youtubeUrl,
  ]);

  const removeQueueItem = (queueId: string) => {
    if (isBatchRunning) {
      return;
    }

    setQueueItems((current) =>
      current.filter((item) => item.queueId !== queueId || item.status === "processing"),
    );
  };

  const updateQueueByLecture = (
    lectureId: string,
    updates: Partial<Pick<QueueItem, "status" | "stage" | "error">>,
  ) => {
    setQueueItems((current) =>
      current.map((item) =>
        item.lectureId === lectureId
          ? {
              ...item,
              ...updates,
            }
          : item,
      ),
    );
  };

  const handleProcessAll = async () => {
    if (isBatchRunning || waitingCount === 0) {
      return;
    }

    const queueSnapshot = queueItems
      .filter((item) => item.status === "waiting" && Boolean(item.lectureId) && Boolean(item.metadata))
      .map((item) => ({
        ...item,
        lectureId: item.lectureId as string,
        metadata: item.metadata as AudioFileMetadata,
      }));

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
        updateQueueByLecture(lectureId, { status: "processing", stage: "transcribing", error: undefined });
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
          updateQueueByLecture(lectureId, { status: "processing", stage: "processing" });

          const estimate = await estimatePipelineWork(lectureId);
          const estimateMessage = `This knowte will process ~${estimate.token_estimate.toLocaleString()} tokens (estimated ${estimate.estimated_minutes_min}-${estimate.estimated_minutes_max} min).`;
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
          updateQueueByLecture(lectureId, { status: "complete", stage: "complete", error: undefined });
          completedCount += 1;
        } catch (processError) {
          const message = processError instanceof Error ? processError.message : String(processError);
          updateLecture(lectureId, { status: "error", error: message });
          updateQueueByLecture(lectureId, { status: "error", stage: "error", error: message });
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
        title="Knowte Input"
        description="Upload audio/video files, import from YouTube, or record directly from your microphone."
      />

      <div
        className="inline-flex rounded-lg p-1 shadow-sm"
        style={{ border: "1px solid var(--border-default)", background: "var(--bg-elevated)" }}
        role="tablist"
        aria-label="Knowte input modes"
      >
        <button
          type="button"
          id="upload-tab"
          role="tab"
          aria-selected={activeTab === "upload"}
          aria-controls="lecture-input-panel"
          onClick={() => setActiveTab("upload")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "upload"
              ? "btn-primary"
              : ""
          }`}
          style={activeTab !== "upload" ? { color: "var(--text-secondary)" } : undefined}
        >
          Upload Files
        </button>
        <button
          type="button"
          id="record-tab"
          role="tab"
          aria-selected={activeTab === "record"}
          aria-controls="lecture-input-panel"
          onClick={() => setActiveTab("record")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "record"
              ? "btn-primary"
              : ""
          }`}
          style={activeTab !== "record" ? { color: "var(--text-secondary)" } : undefined}
        >
          Record Live
        </button>
      </div>

      <section
        id="lecture-input-panel"
        role="tabpanel"
        aria-labelledby={activeTab === "upload" ? "upload-tab" : "record-tab"}
        className="card p-4"
      >
        {activeTab === "upload" ? (
          <div className="space-y-5">
            <DropZone
              onUploadSuccess={handleAudioSuccess}
              onUploadStageChange={handleUploadStageChange}
              onUploadStateChange={setUploading}
              disabled={isRecording || isProcessingLecture || isYoutubeImporting}
            />

            <section className="space-y-3 rounded-lg p-4" style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Import from YouTube</h3>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Paste a public YouTube URL to download audio and add it to the queue.
                </p>
              </div>

              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(event) => {
                    setYoutubeUrl(event.target.value);
                    if (youtubeError) {
                      setYoutubeError(null);
                    }
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={isUploading || isRecording || isProcessingLecture || isYoutubeImporting}
                  className="input w-full"
                />
                <button
                  type="button"
                  onClick={() => void handleYoutubeImport()}
                  disabled={
                    isUploading ||
                    isRecording ||
                    isProcessingLecture ||
                    isYoutubeImporting ||
                    youtubeUrl.trim().length === 0
                  }
                  className="btn-primary whitespace-nowrap"
                  style={{ background: "#dc2626" }}
                >
                  {isYoutubeImporting ? "Importing..." : "Add to Queue"}
                </button>
              </div>

              {youtubeError && <p className="text-xs" style={{ color: "var(--color-error)" }}>{youtubeError}</p>}
            </section>
          </div>
        ) : (
          <LiveRecorder
            onRecordingSaved={(metadata) => handleAudioSuccess([metadata])}
            onRecordingStateChange={setRecording}
            disabled={isUploading || isProcessingLecture}
          />
        )}
      </section>

      {(isUploading || isRecording) && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ border: "1px solid var(--color-info-muted)", background: "var(--color-info-muted)", color: "var(--color-info)" }}>
          {isUploading
            ? isYoutubeImporting
              ? "Importing from YouTube..."
              : "Importing knowte files..."
            : "Recording in progress..."}
        </div>
      )}

      {isProcessingLecture && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ border: "1px solid var(--color-info-muted)", background: "var(--color-info-muted)", color: "var(--color-info)" }}>
          {processHint ?? "Processing queue..."}
        </div>
      )}

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ border: "1px solid var(--color-error-muted)", background: "var(--color-error-muted)", color: "var(--color-error)" }}>
          {error}
        </div>
      )}

      {hasQueueItems && (
        <section className="card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Batch Queue</h2>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {waitingCount > 0
                  ? `${waitingCount} knowte${waitingCount === 1 ? "" : "s"} waiting to process.`
                  : "No waiting knowtes in queue."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleProcessAll()}
              disabled={isUploading || isRecording || isBatchRunning || waitingCount === 0}
              className="btn-primary"
              style={{ background: "var(--color-success)" }}
            >
              {isBatchRunning ? "Processing Queue..." : "Process All"}
            </button>
          </div>

          <ul className="space-y-2">
            {queueItems.map((item) => {
              const canRemove = !isBatchRunning && (item.status === "waiting" || item.status === "error");
              const progress = item.lectureId ? transcriptionProgress[item.lectureId] : undefined;

              return (
                <li
                  key={item.queueId}
                  className="rounded-md px-3 py-3"
                  style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.filename}</p>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${sourceBadgeClass(item.origin, item.sourceType)}`}
                        >
                          {sourceLabel(item.origin, item.sourceType)}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>{stageLabel(item.stage)}</span>
                      </div>

                      {item.metadata ? (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatDuration(item.metadata.duration_seconds)} /{" "}
                          {formatSize(item.metadata.size_bytes)}
                        </p>
                      ) : (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {item.stage === "validating url"
                            ? "Validating YouTube URL..."
                            : item.stage === "downloading"
                              ? "Downloading audio stream from YouTube..."
                              : item.stage === "extracting audio"
                                ? "Extracting 16kHz mono WAV..."
                                : "Preparing import..."}
                        </p>
                      )}

                      <p className="break-all text-xs" style={{ color: "var(--text-muted)" }}>{item.sourcePath}</p>
                      {item.error && <p className="text-xs" style={{ color: "var(--color-error)" }}>{item.error}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeQueueItem(item.queueId)}
                        disabled={!canRemove}
                        className="btn-ghost px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {activeQueueLectureId === item.lectureId && item.stage === "transcribing" && progress && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs" style={{ color: "var(--color-info)" }}>Currently transcribing...</p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Transcription {progress.percent}%{" "}
                        {typeof progress.chunk_index === "number" &&
                        typeof progress.chunk_total === "number"
                          ? `• chunk ${progress.chunk_index}/${progress.chunk_total}`
                          : ""}
                        {typeof progress.chunk_percent === "number"
                          ? ` • segment ${Math.round(progress.chunk_percent ?? 0)}%`
                          : ""}
                        {formatEta(progress.eta_seconds)
                          ? ` • ETA ${formatEta(progress.eta_seconds)}`
                          : ""}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
