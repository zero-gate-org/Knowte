import { useSettingsStore } from "../../stores";
import { WHISPER_MODELS } from "../../lib/types";

export default function ModelSelector() {
  const { ollamaStatus, settings, checkOllama } = useSettingsStore();

  const isConnected = ollamaStatus?.connected ?? false;
  const models = ollamaStatus?.models ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isConnected ? "bg-green-500" : "bg-red-500"
          }`}
          title={isConnected ? "Connected to Ollama" : "Not connected to Ollama"}
        />
        <span className="text-sm text-slate-300">
          {isConnected ? "Connected to Ollama" : "Ollama not reachable"}
        </span>
        <button
          onClick={() => checkOllama(settings?.ollama_url || "http://localhost:11434")}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Refresh
        </button>
      </div>

      {!isConnected && ollamaStatus?.error && (
        <p className="text-xs text-red-400">{ollamaStatus.error}</p>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-300">
          LLM Model
        </label>
        <select
          value={settings?.llm_model || ""}
          disabled={!isConnected}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnected ? (
            models.length > 0 ? (
              models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            ) : (
              <option value="">No models available</option>
            )
          ) : (
            <option value={settings?.llm_model || ""}>
              {settings?.llm_model || "Select model"}
            </option>
          )}
        </select>
        {!isConnected && (
          <p className="text-xs text-slate-400">
            Start Ollama to select available models
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-300">
          Whisper Model
        </label>
        <select
          value={settings?.whisper_model || "base"}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {WHISPER_MODELS.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
