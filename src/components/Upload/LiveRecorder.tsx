import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { HOTKEY_EVENT_NAMES } from "../../lib/hotkeys";
import { startRecording as apiStartRecording, stopRecording as apiStopRecording } from "../../lib/tauriApi";
import type { AudioFileMetadata } from "../../lib/types";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface LiveRecorderProps {
  onRecordingSaved: (metadata: AudioFileMetadata) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  disabled?: boolean;
}

interface RecordingLevelPayload {
  recording_id: string;
  level: number;
}

const BAR_COUNT = 48;

const createEmptyLevels = () => Array.from({ length: BAR_COUNT }, () => 0);

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const formatElapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
};

export default function LiveRecorder({
  onRecordingSaved,
  onRecordingStateChange,
  disabled = false,
}: LiveRecorderProps) {
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<number[]>(() => createEmptyLevels());
  const [isBusy, setIsBusy] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const recordingIdRef = useRef<string | null>(null);

  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#0f172a";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = canvas.width / levels.length;
    for (let index = 0; index < levels.length; index += 1) {
      const level = Math.max(0, Math.min(100, levels[index]));
      const barHeight = (level / 100) * canvas.height;
      const x = index * barWidth;
      const y = canvas.height - barHeight;
      context.fillStyle = "#ef4444";
      context.fillRect(x, y, Math.max(1, barWidth - 2), barHeight);
    }
  }, [levels]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        unlisten = await listen<RecordingLevelPayload>("recording-level", (event) => {
          if (event.payload.recording_id !== recordingIdRef.current) {
            return;
          }

          setLevels((previous) => [
            ...previous.slice(1),
            Math.max(0, Math.min(100, event.payload.level)),
          ]);
        });
      } catch {
        setError("Unable to start live audio visualization in this environment.");
      }
    };

    void setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetVisualizer = () => {
    setLevels(createEmptyLevels());
  };

  const handleStartRecording = useCallback(async () => {
    if (disabled || isBusy || recordingId) {
      return;
    }

    setError(null);
    setIsBusy(true);
    resetVisualizer();
    onRecordingStateChange?.(true);

    try {
      const id = await apiStartRecording();
      setRecordingId(id);
      setElapsedSeconds(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((previous) => previous + 1);
      }, 1000);
    } catch (startError) {
      setError(formatError(startError));
      onRecordingStateChange?.(false);
      resetVisualizer();
    } finally {
      setIsBusy(false);
    }
  }, [disabled, isBusy, onRecordingStateChange, recordingId]);

  const handleStopRecording = useCallback(async () => {
    if (isBusy || !recordingId) {
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      const metadata = await apiStopRecording(recordingId);
      setRecordingId(null);
      setElapsedSeconds(0);
      stopTimer();
      resetVisualizer();
      onRecordingStateChange?.(false);
      onRecordingSaved(metadata);
    } catch (stopError) {
      setError(formatError(stopError));
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, onRecordingSaved, onRecordingStateChange, recordingId]);

  useEffect(() => {
    const handleGlobalStop = () => {
      if (recordingIdRef.current) {
        void handleStopRecording();
      }
    };

    window.addEventListener(HOTKEY_EVENT_NAMES.stopRecording, handleGlobalStop);
    return () => {
      window.removeEventListener(HOTKEY_EVENT_NAMES.stopRecording, handleGlobalStop);
    };
  }, [handleStopRecording]);

  useEffect(() => {
    return () => {
      stopTimer();
      resetVisualizer();

      const activeRecordingId = recordingIdRef.current;
      if (activeRecordingId) {
        void apiStopRecording(activeRecordingId).catch(() => undefined);
      }
      onRecordingStateChange?.(false);
    };
  }, []);

  const isRecording = recordingId !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {!isRecording ? (
          <Button
            type="button"
            onClick={() => void handleStartRecording()}
            disabled={disabled || isBusy}
            aria-label="Start recording"
            variant="destructive"
            className="h-20 w-20 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
          >
            <div className="flex flex-col items-center gap-1">
              <Mic className="size-6" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Record</span>
            </div>
          </Button>
        ) : (
          <Button
            variant="secondary"
            type="button"
            onClick={() => void handleStopRecording()}
            disabled={isBusy}
            aria-label="Stop recording"
            className="h-20 w-20 rounded-full shadow-lg transition-all hover:scale-110 active:scale-95 disabled:opacity-50"
          >
            <div className="flex flex-col items-center gap-1">
              <Square className="size-6 fill-current" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Stop</span>
            </div>
          </Button>
        )}

        <div>
          <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isRecording ? "animate-pulse" : ""
              }`}
              style={{ background: isRecording ? "var(--color-error)" : "var(--text-muted)" }}
              aria-hidden="true"
            />
            {isRecording ? "Recording" : "Elapsed"}
          </p>
          <p className="text-2xl font-mono" style={{ color: "var(--text-primary)" }}>{formatElapsed(elapsedSeconds)}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <canvas
            ref={canvasRef}
            width={640}
            height={160}
            className="h-32 w-full rounded"
            style={{ background: "var(--bg-base)" }}
          />
        </CardContent>
      </Card>

      {error && <p className="text-sm" style={{ color: "var(--color-error)" }}>{error}</p>}
    </div>
  );
}
