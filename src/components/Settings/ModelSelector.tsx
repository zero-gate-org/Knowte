import { useMemo } from "react";
import { useSettingsStore } from "../../stores";
import { WHISPER_MODELS } from "../../lib/types";

interface ModelSelectorProps {
  ollamaUrl: string;
  llmModel: string;
  whisperModel: string;
  onLlmModelChange: (value: string) => void;
  onWhisperModelChange: (value: string) => void;
}

const toModelFileName = (modelSize: string) => `ggml-${modelSize}.bin`;

export default function ModelSelector({
  ollamaUrl,
  llmModel,
  whisperModel,
  onLlmModelChange,
  onWhisperModelChange,
}: ModelSelectorProps) {
  const {
    ollamaStatus,
    whisperModelsOnDisk,
    whisperDownloadingModel,
    whisperDownloadProgress,
    whisperError,
    checkOllama,
    downloadWhisperModel,
  } = useSettingsStore();

  const isConnected = ollamaStatus?.connected ?? false;
  const llmModels = ollamaStatus?.models ?? [];
  const downloadedModelSet = useMemo(
    () => new Set(whisperModelsOnDisk),
    [whisperModelsOnDisk],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
          title={isConnected ? "Connected to Ollama" : "Not connected to Ollama"}
        />
        <span className="text-sm text-slate-300">
          {isConnected ? "Connected to Ollama" : "Ollama not reachable"}
        </span>
        <button
          type="button"
          onClick={() => void checkOllama(ollamaUrl)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Refresh
        </button>
      </div>

      {!isConnected && ollamaStatus?.error && (
        <p className="text-xs text-red-400">{ollamaStatus.error}</p>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-300">LLM Model</label>
        <select
          value={llmModel}
          onChange={(event) => onLlmModelChange(event.target.value)}
          disabled={!isConnected}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isConnected ? (
            llmModels.length > 0 ? (
              llmModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            ) : (
              <option value="">No models available</option>
            )
          ) : (
            <option value={llmModel}>{llmModel || "Select model"}</option>
          )}
        </select>
        {!isConnected && (
          <p className="text-xs text-slate-400">
            Start Ollama to refresh available models.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-300">
          Whisper Model
        </label>
        <select
          value={whisperModel}
          onChange={(event) => onWhisperModelChange(event.target.value)}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {WHISPER_MODELS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Whisper Models</h3>
          <span className="text-xs text-slate-400">Stored in `src-tauri/whisper-models`</span>
        </div>

        <div className="space-y-2">
          {WHISPER_MODELS.map((model) => {
            const fileName = toModelFileName(model.value);
            const isDownloaded = downloadedModelSet.has(fileName);
            const isDownloading = whisperDownloadingModel === model.value;

            return (
              <div
                key={model.value}
                className="flex items-center justify-between rounded-md border border-slate-700 bg-slate-800/70 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-slate-200">{model.value}</p>
                  <p className="text-xs text-slate-400">{fileName}</p>
                </div>

                {isDownloaded ? (
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                    Downloaded
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void downloadWhisperModel(model.value)}
                    disabled={Boolean(whisperDownloadingModel)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDownloading ? "Downloading..." : "Download"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {whisperDownloadingModel && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Downloading {whisperDownloadingModel}</span>
              <span>{Math.round(whisperDownloadProgress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-700">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${whisperDownloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {whisperError && <p className="text-xs text-red-400">{whisperError}</p>}
      </div>
    </div>
  );
}
