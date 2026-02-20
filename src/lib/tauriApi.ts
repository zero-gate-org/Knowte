import { invoke } from "@tauri-apps/api/core";
import type { AudioFileMetadata, OllamaStatus, Settings } from "./types";

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
