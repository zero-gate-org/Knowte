import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type { TranscriptionProgress } from "../../lib/types";
import StageIndicator from "./StageIndicator";

interface ProgressTrackerProps {
  lectureId: string | null;
  className?: string;
}

export default function ProgressTracker({
  lectureId,
  className,
}: ProgressTrackerProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!lectureId) {
      setProgress(0);
      return;
    }

    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen<TranscriptionProgress>(
        "transcription-progress",
        (event) => {
          if (event.payload.lecture_id !== lectureId) {
            return;
          }

          setProgress(Math.max(0, Math.min(100, event.payload.percent)));
        },
      );
    };

    void setup();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [lectureId]);

  if (!lectureId) {
    return null;
  }

  return (
    <section
      className={`space-y-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 ${
        className ?? ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <StageIndicator label="Transcription Stage" />
        <span className="text-sm font-medium text-blue-100">
          Transcribing audio... {Math.round(progress)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-700">
        <div
          className="h-full bg-blue-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  );
}
