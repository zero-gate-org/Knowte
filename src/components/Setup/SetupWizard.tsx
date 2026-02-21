import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkOllamaStatus,
  checkWhisperModels,
  downloadWhisperModel,
} from "../../lib/tauriApi";
import type { OllamaStatus, Settings } from "../../lib/types";
import { PERSONALIZATION_LEVELS } from "../../lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = "welcome" | "ollama" | "model" | "whisper" | "level" | "ready";

interface WizardDownloadProgress {
  percent: number;
  model_size: string;
}

const STEPS: WizardStep[] = ["welcome", "ollama", "model", "whisper", "level", "ready"];

function stepIndex(step: WizardStep): number {
  return STEPS.indexOf(step);
}

// ─── Dot progress indicator ───────────────────────────────────────────────────

function StepDots({ current }: { current: WizardStep }) {
  const currentIdx = stepIndex(current);
  const totalSteps = STEPS.length;

  return (
    <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Setup progress">
      {STEPS.map((step, i) => (
        <div
          key={step}
          role="tab"
          aria-selected={i === currentIdx}
          aria-label={`Step ${i + 1} of ${totalSteps}`}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === currentIdx ? "1.5rem" : "0.5rem",
            height: "0.5rem",
            background:
              i < currentIdx
                ? "var(--accent-primary)"
                : i === currentIdx
                  ? "var(--accent-primary)"
                  : "var(--border-strong)",
            opacity: i > currentIdx ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

// ─── Welcome Step ─────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center animate-fade-in">
      {/* Logo / icon */}
      <div
        className="flex items-center justify-center rounded-2xl"
        style={{
          width: "5rem",
          height: "5rem",
          background: "var(--accent-primary-subtle)",
          border: "1px solid var(--accent-primary-muted)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path d="M20 4L34 12V28L20 36L6 28V12L20 4Z" fill="var(--accent-primary)" fillOpacity="0.15" stroke="var(--accent-primary)" strokeWidth="1.5" />
          <path d="M14 18h12M14 22h8M14 26h10" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="20" cy="14" r="2.5" fill="var(--accent-primary)" />
        </svg>
      </div>

      <div className="space-y-2">
        <h1
          className="text-3xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
        >
          Welcome to Knowte
        </h1>
        <p className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Transform audio and video into structured notes, quizzes, flashcards, and mind maps — 
          all powered by local AI, <strong style={{ color: "var(--text-primary)" }}>completely private</strong>, 
          no cloud required.
        </p>
      </div>

      <div
        className="grid w-full max-w-sm gap-2 rounded-xl p-4 text-left"
        style={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-subtle)" }}
      >
        {[
          { icon: "🎙️", label: "Record or upload audio/video" },
          { icon: "📝", label: "Auto-generate structured notes" },
          { icon: "🧠", label: "Create quizzes & flashcards" },
          { icon: "🔒", label: "Everything stays on your device" },
        ].map(({ icon, label }) => (
          <div key={label} className="flex items-center gap-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>{icon}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        This setup takes about 2 minutes. Let's get you ready.
      </p>

      <button className="btn-primary px-8 py-2.5" onClick={onNext}>
        Get started →
      </button>
    </div>
  );
}

// ─── Ollama Step ──────────────────────────────────────────────────────────────

function OllamaStep({
  ollamaStatus,
  isChecking,
  onCheck,
  onNext,
  onSkip,
}: {
  ollamaStatus: OllamaStatus | null;
  isChecking: boolean;
  onCheck: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const connected = ollamaStatus?.connected ?? false;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="text-center space-y-1">
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
        >
          Step 1 — Install Ollama
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Knowte uses Ollama to run language models locally on your machine.
        </p>
      </div>

      {/* Status card */}
      <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{
          background: connected ? "var(--color-success-subtle)" : "var(--bg-surface-raised)",
          border: `1px solid ${connected ? "var(--color-success)" : "var(--border-default)"}`,
        }}
      >
        <div
          className="rounded-full flex-shrink-0"
          style={{
            width: "0.75rem",
            height: "0.75rem",
            background: isChecking
              ? "var(--color-warning)"
              : connected
                ? "var(--color-success)"
                : "var(--color-error)",
            boxShadow: connected ? "0 0 0 3px var(--color-success-subtle)" : undefined,
          }}
        />
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {isChecking
            ? "Checking Ollama connection…"
            : connected
              ? "Ollama is running — great!"
              : "Ollama is not detected on localhost:11434"}
        </p>
      </div>

      {!connected && (
        <div className="space-y-3">
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)" }}
          >
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              How to install Ollama
            </p>
            <ol className="space-y-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              <li className="flex gap-2">
                <span
                  className="flex-shrink-0 font-bold text-xs rounded-full flex items-center justify-center"
                  style={{
                    width: "1.25rem",
                    height: "1.25rem",
                    background: "var(--accent-primary-subtle)",
                    color: "var(--accent-primary)",
                    marginTop: "1px",
                  }}
                >
                  1
                </span>
                <span>
                  Download from{" "}
                  <button
                    className="underline font-medium"
                    style={{ color: "var(--accent-primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    onClick={() => void openUrl("https://ollama.ai")}
                  >
                    ollama.ai
                  </button>
                </span>
              </li>
              <li className="flex gap-2">
                <span
                  className="flex-shrink-0 font-bold text-xs rounded-full flex items-center justify-center"
                  style={{
                    width: "1.25rem",
                    height: "1.25rem",
                    background: "var(--accent-primary-subtle)",
                    color: "var(--accent-primary)",
                    marginTop: "1px",
                  }}
                >
                  2
                </span>
                <span>Install and run the Ollama application</span>
              </li>
              <li className="flex gap-2">
                <span
                  className="flex-shrink-0 font-bold text-xs rounded-full flex items-center justify-center"
                  style={{
                    width: "1.25rem",
                    height: "1.25rem",
                    background: "var(--accent-primary-subtle)",
                    color: "var(--accent-primary)",
                    marginTop: "1px",
                  }}
                >
                  3
                </span>
                <span>
                  Open a terminal and run:
                  <code
                    className="ml-2 rounded px-2 py-0.5 text-xs"
                    style={{
                      background: "var(--bg-inset)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-subtle)",
                      fontFamily: "monospace",
                    }}
                  >
                    ollama pull llama3.1:8b
                  </code>
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <button className="btn-ghost text-sm" onClick={onSkip}>
          Skip for now
        </button>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={onCheck}
            disabled={isChecking}
          >
            {isChecking ? "Checking…" : "Check again"}
          </button>
          <button
            className="btn-primary"
            onClick={onNext}
            disabled={isChecking}
          >
            {connected ? "Continue →" : "Continue anyway →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Model Step ───────────────────────────────────────────────────────────────

function ModelStep({
  selectedModel,
  onModelChange,
  onNext,
  onBack,
}: {
  selectedModel: string;
  onModelChange: (model: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const SUGGESTED_MODELS = [
    {
      id: "llama3.1:8b",
      label: "Llama 3.1 8B",
      badge: "Recommended",
      description: "Best balance of quality and speed. ~4.7 GB download.",
      badgeColor: "var(--color-success)",
      badgeBg: "var(--color-success-subtle)",
    },
    {
      id: "mistral:7b",
      label: "Mistral 7B",
      badge: null,
      description: "Fast and efficient. Good for most lecture types. ~4.1 GB.",
      badgeColor: null,
      badgeBg: null,
    },
    {
      id: "phi3:mini",
      label: "Phi-3 Mini",
      badge: "Lightweight",
      description: "Runs on low-end hardware. Smaller outputs. ~2.3 GB.",
      badgeColor: "var(--color-info)",
      badgeBg: "var(--color-info-subtle)",
    },
    {
      id: "llama3.1:70b",
      label: "Llama 3.1 70B",
      badge: "Powerful",
      description: "Best quality. Requires 40+ GB RAM. ~40 GB download.",
      badgeColor: "var(--color-warning)",
      badgeBg: "var(--color-warning-subtle)",
    },
  ];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="text-center space-y-1">
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
        >
          Step 2 — Choose a Model
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Select the Ollama model Knowte will use for note generation and quizzes.
        </p>
      </div>

      <div className="space-y-2">
        {SUGGESTED_MODELS.map((m) => (
          <button
            key={m.id}
            onClick={() => onModelChange(m.id)}
            className="w-full rounded-xl px-4 py-3 text-left transition-all"
            style={{
              background:
                selectedModel === m.id ? "var(--accent-primary-subtle)" : "var(--bg-surface-raised)",
              border: `1.5px solid ${selectedModel === m.id ? "var(--accent-primary)" : "var(--border-default)"}`,
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="rounded-full flex-shrink-0 transition-all"
                style={{
                  width: "0.875rem",
                  height: "0.875rem",
                  border: `2px solid ${selectedModel === m.id ? "var(--accent-primary)" : "var(--border-strong)"}`,
                  background: selectedModel === m.id ? "var(--accent-primary)" : "transparent",
                }}
              />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {m.label}
              </span>
              {m.badge && (
                <span
                  className="rounded-full px-2 py-px text-[10px] font-semibold"
                  style={{
                    background: m.badgeBg ?? undefined,
                    color: m.badgeColor ?? undefined,
                    border: `1px solid ${m.badgeColor ?? "transparent"}`,
                  }}
                >
                  {m.badge}
                </span>
              )}
            </div>
            <p className="mt-1 ml-5 text-xs" style={{ color: "var(--text-muted)" }}>
              {m.description}
            </p>
          </button>
        ))}
      </div>

      <div
        className="rounded-lg px-3 py-2.5 text-xs"
        style={{
          background: "var(--color-info-subtle)",
          border: "1px solid var(--color-info)",
          color: "var(--color-info-text)",
        }}
      >
        <strong>To pull the model</strong>, open a terminal and run:{" "}
        <code
          className="rounded px-1.5 py-0.5 ml-1"
          style={{
            background: "rgba(0,0,0,0.15)",
            fontFamily: "monospace",
          }}
        >
          ollama pull {selectedModel}
        </code>
      </div>

      <div className="flex gap-3 justify-between">
        <button className="btn-ghost text-sm" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Whisper Step ─────────────────────────────────────────────────────────────

function WhisperStep({
  whisperModel,
  onWhisperModelChange,
  onNext,
  onBack,
}: {
  whisperModel: string;
  onWhisperModelChange: (model: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isCheckingModels, setIsCheckingModels] = useState(true);
  const unlistenRef = useRef<(() => void) | null>(null);

  const WHISPER_MODELS = [
    { id: "tiny", label: "Tiny", size: "~75 MB", speed: "Fastest", quality: "Basic" },
    { id: "base", label: "Base", size: "~142 MB", speed: "Fast", quality: "Good", recommended: true },
    { id: "small", label: "Small", size: "~466 MB", speed: "Moderate", quality: "Better" },
    { id: "medium", label: "Medium", size: "~1.5 GB", speed: "Slow", quality: "Great" },
    { id: "large", label: "Large", size: "~3.0 GB", speed: "Slowest", quality: "Best" },
  ];

  const refreshModels = useCallback(async () => {
    setIsCheckingModels(true);
    try {
      const models = await checkWhisperModels();
      setDownloadedModels(models);
    } catch {
      setDownloadedModels([]);
    } finally {
      setIsCheckingModels(false);
    }
  }, []);

  useEffect(() => {
    void refreshModels();
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [refreshModels]);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadPercent(0);
    setDownloadError(null);

    try {
      // Subscribe to progress events
      const unlisten = await listen<WizardDownloadProgress>(
        "whisper-download-progress",
        (event) => {
          setDownloadPercent(event.payload.percent);
        },
      );
      unlistenRef.current = unlisten;

      await downloadWhisperModel(whisperModel);
      setDownloadPercent(100);
      await refreshModels();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDownloading(false);
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  };

  const isModelDownloaded = (modelId: string) =>
    downloadedModels.some((m) => m.toLowerCase().includes(modelId));

  const selectedDownloaded = isModelDownloaded(whisperModel);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="text-center space-y-1">
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
        >
          Step 3 — Whisper Model
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Knowte uses Whisper for local speech-to-text. Download a model to enable transcription.
        </p>
      </div>

      {/* Model grid */}
      <div className="grid grid-cols-5 gap-2">
        {WHISPER_MODELS.map((m) => {
          const downloaded = isModelDownloaded(m.id);
          const active = whisperModel === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onWhisperModelChange(m.id)}
              disabled={isDownloading}
              className="rounded-xl p-3 text-center flex flex-col gap-1 items-center transition-all"
              style={{
                background: active ? "var(--accent-primary-subtle)" : "var(--bg-surface-raised)",
                border: `1.5px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                opacity: isDownloading && !active ? 0.5 : 1,
              }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {m.label}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{m.size}</span>
              {downloaded && (
                <span
                  className="text-[10px] font-medium rounded-full px-1.5 py-px"
                  style={{ background: "var(--color-success-subtle)", color: "var(--color-success-text)" }}
                >
                  ✓ Ready
                </span>
              )}
              {m.recommended && !downloaded && (
                <span
                  className="text-[10px] font-medium rounded-full px-1.5 py-px"
                  style={{ background: "var(--accent-primary-subtle)", color: "var(--accent-primary)" }}
                >
                  ★ Suggested
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected model info */}
      <div
        className="rounded-xl p-3 space-y-1"
        style={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Selected: <strong>{WHISPER_MODELS.find((m) => m.id === whisperModel)?.label ?? whisperModel}</strong>
          </p>
          {selectedDownloaded && (
            <span
              className="text-xs font-medium rounded-full px-2 py-px"
              style={{ background: "var(--color-success-subtle)", color: "var(--color-success-text)" }}
            >
              Downloaded ✓
            </span>
          )}
          {isCheckingModels && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Checking…</span>
          )}
        </div>
        {!selectedDownloaded && !isDownloading && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Not downloaded yet.{" "}
            {WHISPER_MODELS.find((m) => m.id === whisperModel)?.size} required.
          </p>
        )}
        {isDownloading && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>Downloading {whisperModel} model…</span>
              <span>{downloadPercent}%</span>
            </div>
            <div
              className="rounded-full overflow-hidden"
              style={{ height: "6px", background: "var(--bg-inset)" }}
            >
              <div
                className="rounded-full transition-all duration-300"
                style={{
                  height: "100%",
                  width: `${downloadPercent}%`,
                  background: "var(--accent-primary)",
                }}
              />
            </div>
          </div>
        )}
        {downloadError && (
          <p className="text-xs" style={{ color: "var(--color-error)" }}>{downloadError}</p>
        )}
      </div>

      {/* Download button */}
      {!selectedDownloaded && (
        <button
          className="btn-primary self-start"
          onClick={() => void handleDownload()}
          disabled={isDownloading}
        >
          {isDownloading ? `Downloading… ${downloadPercent}%` : `Download ${whisperModel} model`}
        </button>
      )}

      <div className="flex gap-3 justify-between">
        <button className="btn-ghost text-sm" onClick={onBack} disabled={isDownloading}>
          ← Back
        </button>
        <button className="btn-primary" onClick={onNext} disabled={isDownloading}>
          {selectedDownloaded ? "Continue →" : "Skip for now →"}
        </button>
      </div>
    </div>
  );
}

// ─── Level Step ───────────────────────────────────────────────────────────────

function LevelStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="text-center space-y-1">
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
        >
          Step 4 — Your Level
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Knowte adapts explanations, notes complexity, and quiz difficulty to match your background.
        </p>
      </div>

      <div className="space-y-2">
        {PERSONALIZATION_LEVELS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="w-full rounded-xl px-4 py-3 text-left transition-all flex items-center gap-3"
            style={{
              background:
                value === opt.value ? "var(--accent-primary-subtle)" : "var(--bg-surface-raised)",
              border: `1.5px solid ${value === opt.value ? "var(--accent-primary)" : "var(--border-default)"}`,
            }}
          >
            <div
              className="rounded-full flex-shrink-0 transition-all"
              style={{
                width: "0.875rem",
                height: "0.875rem",
                border: `2px solid ${value === opt.value ? "var(--accent-primary)" : "var(--border-strong)"}`,
                background: value === opt.value ? "var(--accent-primary)" : "transparent",
              }}
            />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
        You can change this at any time in Settings.
      </p>

      <div className="flex gap-3 justify-between">
        <button className="btn-ghost text-sm" onClick={onBack}>
          ← Back
        </button>
        <button className="btn-primary" onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ─── Ready Step ───────────────────────────────────────────────────────────────

function ReadyStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 text-center animate-fade-in">
      <div
        className="flex items-center justify-center rounded-2xl"
        style={{
          width: "5rem",
          height: "5rem",
          background: "var(--color-success-subtle)",
          border: "1px solid var(--color-success)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="16" fill="var(--color-success)" fillOpacity="0.1" />
          <path
            d="M13 20.5l5 5 9-10"
            stroke="var(--color-success)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="space-y-2">
        <h2
          className="text-3xl font-bold tracking-tight"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}
        >
          You're all set!
        </h2>
        <p className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Knowte is ready. Head to the upload page to process your first knowte.
        </p>
      </div>

      <div
        className="grid w-full max-w-sm gap-2 rounded-xl p-4 text-left"
        style={{ background: "var(--bg-surface-raised)", border: "1px solid var(--border-subtle)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Quick start tips
        </p>
        {[
          { keys: "Ctrl+N", action: "Add a new knowte" },
          { keys: "Ctrl+H", action: "Go to your knowte library" },
          { keys: "?", action: "Show all keyboard shortcuts" },
        ].map(({ keys, action }) => (
          <div key={keys} className="flex items-center justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>{action}</span>
            <kbd
              className="rounded px-2 py-0.5 text-[11px] font-semibold"
              style={{
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface-overlay)",
                color: "var(--text-primary)",
              }}
            >
              {keys}
            </kbd>
          </div>
        ))}
      </div>

      <button className="btn-primary px-10 py-2.5" onClick={onFinish}>
        Open Knowte →
      </button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface SetupWizardProps {
  initialSettings: Settings;
  onComplete: (updates: Partial<Settings>) => Promise<void>;
}

export default function SetupWizard({ initialSettings, onComplete }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [isCheckingOllama, setIsCheckingOllama] = useState(false);
  const [selectedLlmModel, setSelectedLlmModel] = useState(
    initialSettings.llm_model || "llama3.1:8b",
  );
  const [selectedWhisperModel, setSelectedWhisperModel] = useState(
    initialSettings.whisper_model || "base",
  );
  const [selectedLevel, setSelectedLevel] = useState(
    initialSettings.personalization_level || "undergraduate_2nd_year",
  );
  const [isSaving, setIsSaving] = useState(false);

  const checkOllama = useCallback(async () => {
    setIsCheckingOllama(true);
    try {
      const status = await checkOllamaStatus(initialSettings.ollama_url || "http://localhost:11434");
      setOllamaStatus(status);
    } catch {
      setOllamaStatus({ connected: false, models: [], error: "Could not connect to Ollama." });
    } finally {
      setIsCheckingOllama(false);
    }
  }, [initialSettings.ollama_url]);

  // Auto-check Ollama when arriving at that step
  useEffect(() => {
    if (step === "ollama" && ollamaStatus === null) {
      void checkOllama();
    }
  }, [step, ollamaStatus, checkOllama]);

  const advance = useCallback(() => {
    const idx = stepIndex(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  }, [step]);

  const retreat = useCallback(() => {
    const idx = stepIndex(step);
    if (idx > 0) {
      setStep(STEPS[idx - 1]);
    }
  }, [step]);

  const handleFinish = useCallback(async () => {
    setIsSaving(true);
    try {
      await onComplete({
        llm_model: selectedLlmModel,
        whisper_model: selectedWhisperModel,
        personalization_level: selectedLevel,
        setup_complete: true,
      });
    } finally {
      setIsSaving(false);
    }
  }, [onComplete, selectedLlmModel, selectedWhisperModel, selectedLevel]);

  const handleSkipAll = useCallback(async () => {
    setIsSaving(true);
    try {
      await onComplete({ setup_complete: true });
    } finally {
      setIsSaving(false);
    }
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--bg-base)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Knowte setup wizard"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl mx-4 p-8 flex flex-col gap-6"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--card-shadow-lg)",
          maxHeight: "calc(100vh - 4rem)",
          overflowY: "auto",
        }}
      >
        {/* Skip all button */}
        {step !== "ready" && (
          <button
            className="absolute top-4 right-4 btn-ghost text-xs"
            onClick={() => void handleSkipAll()}
            disabled={isSaving}
            aria-label="Skip setup and open Knowte"
          >
            Skip setup
          </button>
        )}

        {/* Step dots */}
        <StepDots current={step} />

        {/* Step content */}
        {step === "welcome" && <WelcomeStep onNext={advance} />}
        {step === "ollama" && (
          <OllamaStep
            ollamaStatus={ollamaStatus}
            isChecking={isCheckingOllama}
            onCheck={() => void checkOllama()}
            onNext={advance}
            onSkip={() => void handleSkipAll()}
          />
        )}
        {step === "model" && (
          <ModelStep
            selectedModel={selectedLlmModel}
            onModelChange={setSelectedLlmModel}
            onNext={advance}
            onBack={retreat}
          />
        )}
        {step === "whisper" && (
          <WhisperStep
            whisperModel={selectedWhisperModel}
            onWhisperModelChange={setSelectedWhisperModel}
            onNext={advance}
            onBack={retreat}
          />
        )}
        {step === "level" && (
          <LevelStep
            value={selectedLevel}
            onChange={setSelectedLevel}
            onNext={advance}
            onBack={retreat}
          />
        )}
        {step === "ready" && (
          <ReadyStep onFinish={() => void handleFinish()} />
        )}

        {isSaving && (
          <div className="flex items-center justify-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <div
              className="rounded-full animate-spin"
              style={{
                width: "1rem",
                height: "1rem",
                border: "2px solid var(--border-default)",
                borderTopColor: "var(--accent-primary)",
              }}
            />
            Saving preferences…
          </div>
        )}
      </div>
    </div>
  );
}
