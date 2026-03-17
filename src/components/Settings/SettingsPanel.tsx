import { useEffect, useState } from "react";
import { GLOBAL_SHORTCUTS, LECTURE_VIEW_SHORTCUTS } from "../../lib/hotkeys";
import { getStorageUsage } from "../../lib/tauriApi";
import { useSettingsStore, useToastStore } from "../../stores";
import { ViewHeader } from "../Layout";
import ModelSelector from "./ModelSelector";
import PersonalizationConfig from "./PersonalizationConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { RefreshCw, Save, HardDrive, Keyboard, Globe, Sparkles, MessageSquare, AlertCircle } from "lucide-react";
import type { Settings, StorageUsage } from "../../lib/types";

function renderShortcutKeys(keys: string) {
  return keys.split("+").map((part) => (
    <kbd
      key={`${keys}-${part}`}
      className="inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
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
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Spinner className="size-8" />
        <div className="text-sm text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-20">
      <ViewHeader
        title="Settings"
        description="Configure local models, personalization, and export defaults."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <CardTitle>Ollama Connection</CardTitle>
            </div>
            <CardDescription>Configure your local LLM backend</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ollama_url">Ollama URL</Label>
              <Input
                id="ollama_url"
                type="text"
                value={formData.ollama_url}
                onChange={(e) => updateField("ollama_url", e.target.value)}
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
              <Label htmlFor="llm_timeout">LLM timeout (seconds)</Label>
              <Input
                id="llm_timeout"
                type="number"
                min={30}
                max={1800}
                step={1}
                value={formData.llm_timeout_seconds}
                onChange={(e) =>
                  updateField("llm_timeout_seconds", Math.max(30, Math.min(1800, Number(e.target.value) || 300)))
                }
                placeholder="300"
              />
              <p className="text-[10px] text-muted-foreground">
                Applies to all LLM requests. Recommended range: 120-600 seconds.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle>Personalization</CardTitle>
            </div>
            <CardDescription>Tailor learning materials to your preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <PersonalizationConfig
              value={formData.personalization_level}
              onChange={(value) => updateField("personalization_level", value)}
            />
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <CardTitle>Export Settings</CardTitle>
            </div>
            <CardDescription>Default locations for your generated data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="export_path">Export Path</Label>
              <Input
                id="export_path"
                type="text"
                value={formData.export_path}
                onChange={(e) => updateField("export_path", e.target.value)}
                placeholder="~/Documents/Knowte"
              />
              <p className="text-[10px] text-muted-foreground">
                Default location for exported files
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" />
              <CardTitle>Storage</CardTitle>
            </div>
            <CardDescription>Manage local file optimization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3">
              <Switch
                id="delete_audio"
                type="button"
                checked={formData.delete_audio_after_processing}
                onCheckedChange={(checked) => updateField("delete_audio_after_processing", checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="delete_audio">Delete audio after processing</Label>
                <p className="text-[10px] text-muted-foreground">
                  Removes original and prepared audio files once pipeline generation finishes successfully.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              {isStorageLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner className="size-3" />
                  Loading storage usage…
                </div>
              ) : storageUsage ? (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>App data:</span>
                    <span className="font-medium text-foreground">{formatBytes(storageUsage.app_data_bytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Knowtes audio:</span>
                    <span className="font-medium text-foreground">{formatBytes(storageUsage.lectures_bytes)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Prepared audio:</span>
                    <span className="font-medium text-foreground">{formatBytes(storageUsage.prepared_audio_bytes)}</span>
                  </div>
                  <div className="flex justify-between pt-1 font-semibold">
                    <span>Free disk space:</span>
                    <span className="text-foreground">{formatBytes(storageUsage.free_bytes)}</span>
                  </div>
                  <p className="mt-3 break-all text-[9px] opacity-70">Path: {storageUsage.app_data_dir}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Storage usage is unavailable.</p>
              )}

              {storageError && (
                <Alert variant="destructive" className="mt-3 py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-[10px]">{storageError}</AlertDescription>
                </Alert>
              )}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => void loadStorageUsage()}
                disabled={isStorageLoading}
                className="mt-4 h-7 text-[10px]"
              >
                {!isStorageLoading && <RefreshCw className="mr-1.5 h-3 w-3" />}
                {isStorageLoading ? "Refreshing…" : "Refresh usage"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <CardTitle>Research</CardTitle>
            </div>
            <CardDescription>Integrate external academic data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3">
              <Switch
                id="enable_research"
                type="button"
                checked={formData.enable_research}
                onCheckedChange={(checked) => updateField("enable_research", checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="enable_research">Enable research paper search (requires internet)</Label>
                <p className="text-[10px] text-muted-foreground">
                  When enabled, Knowte queries the Semantic Scholar API to find papers
                  related to your knowte content. This is the only external network call
                  the app makes.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-primary" />
              <CardTitle>Keyboard Shortcuts</CardTitle>
            </div>
            <CardDescription className="flex items-center gap-1.5">
              Press {renderShortcutKeys("?")} anywhere in the app to open the full shortcuts modal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Global</p>
                <div className="grid gap-2">
                  {GLOBAL_SHORTCUTS.map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="flex items-center justify-between rounded-lg border bg-card/50 px-3 py-2"
                    >
                      <div className="flex gap-1">{renderShortcutKeys(shortcut.keys)}</div>
                      <span className="text-[11px] text-muted-foreground">{shortcut.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">Knowte Views</p>
                <div className="grid gap-2">
                  {LECTURE_VIEW_SHORTCUTS.map((shortcut) => (
                    <div
                      key={shortcut.key}
                      className="flex items-center justify-between rounded-lg border bg-card/50 px-3 py-2"
                    >
                      <div className="flex gap-1">{renderShortcutKeys(`Ctrl+${shortcut.key}`)}</div>
                      <span className="text-[11px] text-muted-foreground">{shortcut.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={isSaving}
            className="h-10 px-8"
          >
            {isSaving ? (
              <>
                <Spinner className="mr-2 size-4" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </form>

      {error && (
        <Alert variant="destructive" className="animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error saving settings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
