import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { SUPPORTED_AUDIO_EXTENSIONS } from "../../lib/constants";
import { acceptAudioFile, pickAudioFile } from "../../lib/tauriApi";
import type { AudioFileMetadata } from "../../lib/types";

interface DropZoneProps {
  onUploadSuccess: (metadata: AudioFileMetadata) => void;
  onUploadStateChange?: (isUploading: boolean) => void;
  disabled?: boolean;
}

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export default function DropZone({
  onUploadSuccess,
  onUploadStateChange,
  disabled = false,
}: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilePath = async (filePath: string) => {
    if (disabled || isProcessing) {
      return;
    }

    setError(null);
    setIsProcessing(true);
    onUploadStateChange?.(true);

    try {
      const metadata = await acceptAudioFile(filePath);
      onUploadSuccess(metadata);
    } catch (uploadError) {
      setError(formatError(uploadError));
    } finally {
      setIsProcessing(false);
      onUploadStateChange?.(false);
      setIsDragActive(false);
    }
  };

  const handleBrowseClick = async () => {
    if (disabled || isProcessing) {
      return;
    }

    setError(null);
    try {
      const selectedPath = await pickAudioFile();
      if (!selectedPath) {
        return;
      }
      await handleFilePath(selectedPath);
    } catch (pickError) {
      setError(formatError(pickError));
    }
  };

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let isMounted = true;
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await getCurrentWindow().onDragDropEvent((event) => {
        if (!isMounted || disabled || isProcessing) {
          return;
        }

        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsDragActive(true);
          return;
        }

        if (event.payload.type === "leave") {
          setIsDragActive(false);
          return;
        }

        if (event.payload.type === "drop") {
          const [filePath] = event.payload.paths;
          if (filePath) {
            void handleFilePath(filePath);
          } else {
            setIsDragActive(false);
          }
        }
      });
    };

    void setupListener();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [disabled, isProcessing]);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragActive
            ? "border-blue-400 bg-blue-500/10"
            : "border-slate-600 bg-slate-800/40"
        }`}
      >
        <h3 className="text-lg font-semibold text-slate-100">
          Drag and drop your lecture file
        </h3>
        <p className="mt-2 text-sm text-slate-400">
          Supported: {SUPPORTED_AUDIO_EXTENSIONS.join(", ")}
        </p>
        <button
          type="button"
          onClick={() => void handleBrowseClick()}
          disabled={disabled || isProcessing}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isProcessing ? "Importing..." : "Browse files"}
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
