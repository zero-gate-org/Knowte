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
      className="rounded px-2 py-0.5 text-xs font-semibold"
      style={{
        border: "1px solid var(--border-strong)",
        background: "var(--bg-surface-overlay)",
        color: "var(--text-primary)",
      }}
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
        <div style={{ color: "var(--text-muted)" }}>Loading settings...</div>
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
        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Ollama Connection</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Ollama URL
            </label>
            <input
              type="text"
              value={formData.ollama_url}
              onChange={(e) => updateField("ollama_url", e.target.value)}
              className="input w-full"
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
            <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
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
              className="input w-full"
              placeholder="300"
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Applies to all LLM requests. Recommended range: 120-600 seconds.
            </p>
          </div>
        </div>

        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Personalization</h2>
          <PersonalizationConfig
            value={formData.personalization_level}
            onChange={(value) => updateField("personalization_level", value)}
          />
        </div>

        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Export Settings</h2>
          <div className="space-y-2">
            <label className="block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Export Path
            </label>
            <input
              type="text"
              value={formData.export_path}
              onChange={(e) => updateField("export_path", e.target.value)}
              className="input w-full"
              placeholder="~/Documents/Knowte"
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Default location for exported files
            </p>
          </div>
        </div>

        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Storage</h2>

          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={formData.delete_audio_after_processing}
                onChange={(e) => updateField("delete_audio_after_processing", e.target.checked)}
                className="sr-only"
              />
              <div
                className="toggle-track cursor-pointer"
                data-checked={formData.delete_audio_after_processing || undefined}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Delete audio after processing</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Removes original and prepared audio files once pipeline generation finishes successfully.
              </p>
            </div>
          </label>

          <div className="rounded-md p-3" style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}>
            {isStorageLoading ? (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading storage usage…</p>
            ) : storageUsage ? (
              <div className="space-y-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                <p>App data: <span style={{ color: "var(--text-primary)" }}>{formatBytes(storageUsage.app_data_bytes)}</span></p>
                <p>Knowtes audio: <span style={{ color: "var(--text-primary)" }}>{formatBytes(storageUsage.lectures_bytes)}</span></p>
                <p>Prepared audio: <span style={{ color: "var(--text-primary)" }}>{formatBytes(storageUsage.prepared_audio_bytes)}</span></p>
                <p>Free disk space: <span style={{ color: "var(--text-primary)" }}>{formatBytes(storageUsage.free_bytes)}</span></p>
                <p className="break-all" style={{ color: "var(--text-muted)" }}>Path: {storageUsage.app_data_dir}</p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Storage usage is unavailable.</p>
            )}

            {storageError && <p className="mt-2 text-xs" style={{ color: "var(--color-error)" }}>{storageError}</p>}
            <button
              type="button"
              onClick={() => void loadStorageUsage()}
              disabled={isStorageLoading}
              className="btn-ghost mt-3 text-xs"
            >
              {isStorageLoading ? "Refreshing…" : "Refresh usage"}
            </button>
          </div>
        </div>

        <div className="card space-y-4 p-4">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Research</h2>
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={formData.enable_research}
                onChange={(e) => updateField("enable_research", e.target.checked)}
                className="sr-only"
              />
              <div
                className="toggle-track cursor-pointer"
                data-checked={formData.enable_research || undefined}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Enable research paper search (requires internet)
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                When enabled, Knowte queries the Semantic Scholar API to find papers
                related to your knowte content. This is the only external network call
                the app makes.
              </p>
            </div>
          </label>
        </div>

        <div className="card space-y-4 p-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>Keyboard Shortcuts</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Press <kbd className="rounded px-1.5 py-0.5 text-[11px]" style={{ border: "1px solid var(--border-strong)", background: "var(--bg-surface-overlay)", color: "var(--text-secondary)" }}>?</kbd> anywhere in the app to open the full shortcuts modal.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Global</p>
              {GLOBAL_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}
                >
                  <div className="flex items-center gap-1">{renderShortcutKeys(shortcut.keys)}</div>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{shortcut.action}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Knowte Views</p>
              {LECTURE_VIEW_SHORTCUTS.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                  style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface-overlay)" }}
                >
                  <div className="flex items-center gap-1">{renderShortcutKeys(`Ctrl+${shortcut.key}`)}</div>
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{shortcut.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="btn-primary px-6 py-2"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ border: "1px solid var(--color-error-muted)", background: "var(--color-error-muted)", color: "var(--color-error)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
