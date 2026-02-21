import { useEffect, useState } from "react";
import { GLOBAL_SHORTCUTS, LECTURE_VIEW_SHORTCUTS } from "../../lib/hotkeys";
import { getStorageUsage } from "../../lib/tauriApi";
import { useSettingsStore, useToastStore } from "../../stores";
import { ViewHeader } from "../Layout";
import ModelSelector from "./ModelSelector";
import PersonalizationConfig from "./PersonalizationConfig";
import type { Settings, StorageUsage } from "../../lib/types";

function renderShortcutKeys(keys: string) {
  return keys.split("+").map((part) => (
    <kbd
      key={`${keys}-${part}`}
      className="rounded border border-slate-500 bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-100"
    >
      {part}
    </kbd>
  ));
}

export default function SettingsPanel() {
  const { settings, isLoading, isSaving, error, loadSettings, saveSettings, checkOllama } =
    useSettingsStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [formData, setFormData] = useState<Settings | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [isStorageLoading, setIsStorageLoading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const formatBytes = (value: number) => {
    if (!Number.isFinite(value) || value < 1024) {
      return `${Math.max(0, Math.floor(value))} B`;
    }
    const units = ["KB", "MB", "GB", "TB"];
    let size = value / 1024;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[index]}`;
  };

  const loadStorageUsage = async () => {
    setIsStorageLoading(true);
    setStorageError(null);
    try {
      const usage = await getStorageUsage();
      setStorageUsage(usage);
    } catch (usageError) {
      setStorageError(usageError instanceof Error ? usageError.message : String(usageError));
    } finally {
      setIsStorageLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  useEffect(() => {
    void loadStorageUsage();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    const success = await saveSettings(formData);
    if (success) {
      pushToast({
        kind: "success",
        message: "Settings saved successfully.",
      });
    } else {
      pushToast({
        kind: "error",
        message: "Failed to save settings. Check the form values and try again.",
      });
    }
  };

  const updateField = <K extends keyof Settings>(field: K, value: Settings[K]) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });

    if (field === "ollama_url") {
      checkOllama(value as string);
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <ViewHeader
        title="Settings"
        description="Configure local models, personalization, and export defaults."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-200">Ollama Connection</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Ollama URL
            </label>
            <input
              type="text"
              value={formData.ollama_url}
              onChange={(e) => updateField("ollama_url", e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="http://localhost:11434"
            />
          </div>
          <ModelSelector
            ollamaUrl={formData.ollama_url}
            llmModel={formData.llm_model}
            whisperModel={formData.whisper_model}
            onLlmModelChange={(value) => updateField("llm_model", value)}
            onWhisperModelChange={(value) => updateField("whisper_model", value)}
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              LLM timeout (seconds)
            </label>
            <input
              type="number"
              min={30}
              max={1800}
              step={1}
              value={formData.llm_timeout_seconds}
              onChange={(e) =>
                updateField("llm_timeout_seconds", Math.max(30, Math.min(1800, Number(e.target.value) || 300)))
              }
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="300"
            />
            <p className="text-xs text-slate-400">
              Applies to all LLM requests. Recommended range: 120-600 seconds.
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-200">Personalization</h2>
          <PersonalizationConfig
            value={formData.personalization_level}
            onChange={(value) => updateField("personalization_level", value)}
          />
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-200">Export Settings</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-300">
              Export Path
            </label>
            <input
              type="text"
              value={formData.export_path}
              onChange={(e) => updateField("export_path", e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="~/Documents/Cognote"
            />
            <p className="text-xs text-slate-400">
              Default location for exported files
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-200">Storage</h2>

          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={formData.delete_audio_after_processing}
                onChange={(e) => updateField("delete_audio_after_processing", e.target.checked)}
                className="sr-only"
              />
              <div
                onClick={() =>
                  updateField("delete_audio_after_processing", !formData.delete_audio_after_processing)
                }
                className={`w-10 h-5 rounded-full transition-colors ${
                  formData.delete_audio_after_processing ? "bg-blue-600" : "bg-slate-600"
                } flex items-center px-0.5 cursor-pointer`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    formData.delete_audio_after_processing ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Delete audio after processing</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Removes original and prepared audio files once pipeline generation finishes successfully.
              </p>
            </div>
          </label>

          <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3">
            {isStorageLoading ? (
              <p className="text-xs text-slate-400">Loading storage usage…</p>
            ) : storageUsage ? (
              <div className="space-y-1.5 text-xs text-slate-300">
                <p>App data: <span className="text-slate-100">{formatBytes(storageUsage.app_data_bytes)}</span></p>
                <p>Lectures audio: <span className="text-slate-100">{formatBytes(storageUsage.lectures_bytes)}</span></p>
                <p>Prepared audio: <span className="text-slate-100">{formatBytes(storageUsage.prepared_audio_bytes)}</span></p>
                <p>Free disk space: <span className="text-slate-100">{formatBytes(storageUsage.free_bytes)}</span></p>
                <p className="break-all text-slate-500">Path: {storageUsage.app_data_dir}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Storage usage is unavailable.</p>
            )}

            {storageError && <p className="mt-2 text-xs text-red-300">{storageError}</p>}
            <button
              type="button"
              onClick={() => void loadStorageUsage()}
              disabled={isStorageLoading}
              className="mt-3 rounded-md border border-slate-600 px-2.5 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-60"
            >
              {isStorageLoading ? "Refreshing…" : "Refresh usage"}
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-200">Research</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={formData.enable_research}
                onChange={(e) => updateField("enable_research", e.target.checked)}
                className="sr-only"
              />
              <div
                onClick={() => updateField("enable_research", !formData.enable_research)}
                className={`w-10 h-5 rounded-full transition-colors ${
                  formData.enable_research ? "bg-blue-600" : "bg-slate-600"
                } flex items-center px-0.5 cursor-pointer`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    formData.enable_research ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">
                Enable research paper search (requires internet)
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                When enabled, Cognote queries the Semantic Scholar API to find papers
                related to your lecture content. This is the only external network call
                the app makes.
              </p>
            </div>
          </label>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-800 p-4 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-200">Keyboard Shortcuts</h2>
            <p className="text-xs text-slate-400">
              Press <kbd className="rounded border border-slate-500 bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-200">?</kbd> anywhere in the app to open the full shortcuts modal.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Global</p>
              {GLOBAL_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2"
                >
                  <div className="flex items-center gap-1">{renderShortcutKeys(shortcut.keys)}</div>
                  <span className="text-xs text-slate-300">{shortcut.action}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lecture Views</p>
              {LECTURE_VIEW_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2"
                >
                  <div className="flex items-center gap-1">{renderShortcutKeys(`Ctrl+${shortcut.key}`)}</div>
                  <span className="text-xs text-slate-300">{shortcut.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
