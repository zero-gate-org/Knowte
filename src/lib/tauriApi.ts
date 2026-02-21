import { invoke } from "@tauri-apps/api/core";
import type {
  AudioFileMetadata,
  OllamaStatus,
  Settings,
  TranscriptUpdateResult,
  TranscriptionResult,
} from "./types";

// ─── LLM Commands ─────────────────────────────────────────────────────────────

/**
 * Generate a response from the configured Ollama model with streaming.
 * Emits `llm-stream` events (LlmStreamEvent) as tokens arrive.
 *
 * @param lectureId  - ID of the lecture being processed (forwarded in events)
 * @param stage      - Pipeline stage label, e.g. "summary", "notes", "quiz"
 * @param model      - Ollama model name; empty string uses the value from settings
 * @param prompt     - The full prompt to send
 * @param expectJson - When true, extracts JSON and retries once on parse failure
 * @returns The (possibly JSON-extracted) response string
 */
export async function generateLlmResponse(
  lectureId: string,
  stage: string,
  model: string,
  prompt: string,
  expectJson: boolean,
): Promise<string> {
  return invoke<string>("generate_llm_response", {
    lectureId,
    stage,
    model,
    prompt,
    expectJson,
  });
}

/**
 * Quick health check — returns true if the Ollama server at the configured
 * URL is reachable. Useful for UI availability indicators.
 */
export async function checkLlmAvailability(): Promise<boolean> {
  return invoke<boolean>("check_llm_availability");
}

export async function checkOllamaStatus(ollamaUrl: string): Promise<OllamaStatus> {
  return invoke<OllamaStatus>("check_ollama_status", { ollamaUrl });
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function saveSettings(settings: Settings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function pickAudioFile(): Promise<string | null> {
  return invoke<string | null>("pick_audio_file");
}

export async function acceptAudioFile(path: string): Promise<AudioFileMetadata> {
  return invoke<AudioFileMetadata>("accept_audio_file", { path });
}

export async function startRecording(): Promise<string> {
  return invoke<string>("start_recording");
}

export async function stopRecording(recordingId: string): Promise<AudioFileMetadata> {
  return invoke<AudioFileMetadata>("stop_recording", { recordingId });
}

export async function checkWhisperModels(): Promise<string[]> {
  return invoke<string[]>("check_whisper_models");
}

export async function downloadWhisperModel(modelSize: string): Promise<string> {
  return invoke<string>("download_whisper_model", { modelSize });
}

export async function transcribeAudio(lectureId: string): Promise<TranscriptionResult> {
  return invoke<TranscriptionResult>("transcribe_audio", { lectureId });
}

export async function updateTranscriptSegment(
  transcriptId: string,
  segmentIndex: number,
  newText: string,
): Promise<TranscriptUpdateResult> {
  return invoke<TranscriptUpdateResult>("update_transcript_segment", {
    transcriptId,
    segmentIndex,
    newText,
  });
}

export async function getLectureAudioUrl(lectureId: string): Promise<string> {
  return invoke<string>("get_lecture_audio_url", { lectureId });
}
