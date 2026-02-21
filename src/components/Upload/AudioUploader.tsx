import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { transcribeAudio, startPipeline } from "../../lib/tauriApi";
import { useLectureStore, useToastStore } from "../../stores";
import type { AudioFileMetadata, Lecture } from "../../lib/types";
import DropZone from "./DropZone";
import LiveRecorder from "./LiveRecorder";

type UploadTab = "upload" | "record";

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

export default function AudioUploader() {
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [latestMetadata, setLatestMetadata] = useState<AudioFileMetadata | null>(null);
  const [processHint, setProcessHint] = useState<string | null>(null);
  const navigate = useNavigate();
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

  const handleAudioSuccess = (metadata: AudioFileMetadata) => {
    const lecture = toLecture(metadata);
    addLecture(lecture);
    setCurrentLecture(lecture.id);
    setLatestMetadata(metadata);
    setProcessHint(null);
    setError(null);
    pushToast({ kind: "success", message: "Audio imported successfully." });
  };

  const handleProcessLecture = async () => {
    if (!latestMetadata || isProcessingLecture) {
      return;
    }

    const lectureId = latestMetadata.id;
    setProcessingLecture(true);
    setError(null);
    setProcessHint("Transcribing audio...");
    updateLecture(lectureId, { status: "transcribing", error: undefined });

    try {
      const result = await transcribeAudio(lectureId);
      updateLecture(lectureId, {
        status: "processing",
        transcriptId: result.transcript_id,
        transcript: result.full_text,
        transcriptSegments: result.segments,
        originalTranscriptSegments: result.segments.map((segment) => ({ ...segment })),
        error: undefined,
      });
      setCurrentLecture(lectureId);
      setProcessHint("Transcription complete. Starting AI pipeline...");

      // Start the pipeline in the background
      await startPipeline(lectureId);

      // Navigate to the pipeline progress view
      navigate(`/lecture/${lectureId}/pipeline`);
      pushToast({ kind: "info", message: "Transcription complete. Pipeline started." });
    } catch (transcriptionError) {
      const message =
        transcriptionError instanceof Error
          ? transcriptionError.message
          : String(transcriptionError);
      updateLecture(lectureId, { status: "error", error: message });
      setError(message);
      setProcessHint("Processing failed. See error details above.");
      pushToast({ kind: "error", message });
    } finally {
      setProcessingLecture(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-100">Audio Input</h1>
        <p className="text-sm text-slate-400">
          Upload a lecture file or record directly from your microphone.
        </p>
      </header>

      <div
        className="inline-flex rounded-lg border border-slate-700 bg-slate-800 p-1"
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
          Upload File
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
        className="rounded-xl border border-slate-700 bg-slate-800/70 p-6"
      >
        {activeTab === "upload" ? (
          <DropZone
            onUploadSuccess={handleAudioSuccess}
            onUploadStateChange={setUploading}
            disabled={isRecording || isProcessingLecture}
          />
        ) : (
          <LiveRecorder
            onRecordingSaved={handleAudioSuccess}
            onRecordingStateChange={setRecording}
            disabled={isUploading || isProcessingLecture}
          />
        )}
      </section>

      {(isUploading || isRecording) && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {isUploading ? "Importing audio file..." : "Recording in progress..."}
        </div>
      )}

      {isProcessingLecture && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
          {processHint ?? "Processing…"}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {latestMetadata && (
        <section className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Lecture Ready</h2>
          <div className="grid gap-4 text-sm text-slate-300 md:grid-cols-2">
            <div>
              <p className="text-slate-400">Filename</p>
              <p className="break-all">{latestMetadata.filename}</p>
            </div>
            <div>
              <p className="text-slate-400">Duration</p>
              <p>{formatDuration(latestMetadata.duration_seconds)}</p>
            </div>
            <div>
              <p className="text-slate-400">File Size</p>
              <p>{formatSize(latestMetadata.size_bytes)}</p>
            </div>
            <div>
              <p className="text-slate-400">Stored Path</p>
              <p className="break-all">{latestMetadata.path}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void handleProcessLecture()}
              disabled={isUploading || isRecording || isProcessingLecture}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessingLecture ? "Processing..." : "Process Lecture"}
            </button>
            {processHint && <p className="text-sm text-slate-400">{processHint}</p>}
          </div>
        </section>
      )}
    </div>
  );
}
