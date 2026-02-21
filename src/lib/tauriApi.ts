import { invoke } from "@tauri-apps/api/core";
import type {
  AudioFileMetadata,
  OllamaStatus,
  Paper,
  PipelineStageRecord,
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

// ─── Pipeline Commands ────────────────────────────────────────────────────────

/**
 * Start the full processing pipeline for a lecture in a background task.
 * Returns immediately; listen for `pipeline-stage` events for progress.
 */
export async function startPipeline(lectureId: string): Promise<void> {
  return invoke("start_pipeline", { lectureId });
}

/**
 * Get the current pipeline stage statuses for a lecture from the database.
 * Useful for restoring UI state after navigation.
 */
export async function getPipelineStatus(lectureId: string): Promise<PipelineStageRecord[]> {
  return invoke<PipelineStageRecord[]>("get_pipeline_status", { lectureId });
}

/** Retrieve structured notes JSON for a lecture (null if not yet generated). */
export async function getNotes(lectureId: string): Promise<string | null> {
  return invoke<string | null>("get_notes", { lectureId });
}

/** Retrieve quiz JSON for a lecture (null if not yet generated). */
export async function getQuiz(lectureId: string): Promise<string | null> {
  return invoke<string | null>("get_quiz", { lectureId });
}

/** Retrieve flashcards JSON for a lecture (null if not yet generated). */
export async function getFlashcards(lectureId: string): Promise<string | null> {
  return invoke<string | null>("get_flashcards", { lectureId });
}

/** Retrieve mind-map JSON for a lecture (null if not yet generated). */
export async function getMindmap(lectureId: string): Promise<string | null> {
  return invoke<string | null>("get_mindmap", { lectureId });
}

// ─── Research Commands ────────────────────────────────────────────────────────

/**
 * Search Semantic Scholar for papers related to this lecture.
 * Reads keywords from the pipeline results, calls the external API,
 * saves results, and returns them. Requires internet access.
 */
export async function searchRelatedPapers(lectureId: string): Promise<Paper[]> {
  return invoke<Paper[]>("search_related_papers", { lectureId });
}

/**
 * Return previously-saved research papers for a lecture (null if none saved yet).
 */
export async function getLecturePapers(lectureId: string): Promise<Paper[] | null> {
  return invoke<Paper[] | null>("get_lecture_papers", { lectureId });
}

// ─── Mind Map Commands ────────────────────────────────────────────────────────

/**
 * Re-run the mind-map generation stage for a lecture using the current LLM
 * settings.  Returns the new mind-map JSON string, or null on error.
 */
export async function regenerateMindmap(lectureId: string): Promise<string | null> {
  return invoke<string | null>("regenerate_mindmap", { lectureId });
}

// ─── Notes Commands ───────────────────────────────────────────────────────────

/**
 * Re-run the structured notes stage for a lecture using the current LLM
 * settings.  Returns the new notes JSON string, or null on error.
 */
export async function regenerateNotes(lectureId: string): Promise<string | null> {
  return invoke<string | null>("regenerate_notes", { lectureId });
}

/**
 * Convert the stored notes to Markdown, open a native save-file dialog, and
 * write the file.  Returns the saved file path, or null if the user cancelled.
 */
export async function exportNotesMarkdown(lectureId: string): Promise<string | null> {
  return invoke<string | null>("export_notes_markdown", { lectureId });
}

// ─── Quiz Commands ────────────────────────────────────────────────────────────

/**
 * Re-run the quiz generation stage for a lecture using the current LLM
 * settings.  Returns the new quiz JSON string, or null on error.
 */
export async function regenerateQuiz(lectureId: string): Promise<string | null> {
  return invoke<string | null>("regenerate_quiz", { lectureId });
}

// ─── Flashcard Export Commands ────────────────────────────────────────────────

/**
 * Open a native save-file dialog and write the flashcards as an Anki .apkg
 * package.  Returns the saved file path, or null if the user cancelled.
 */
export async function exportFlashcardsAnki(lectureId: string): Promise<string | null> {
  return invoke<string | null>("export_flashcards_anki", { lectureId });
}

/**
 * Open a native save-file dialog and write the flashcards as a
 * tab-separated .txt file for Anki import.
 * Returns the saved file path, or null if the user cancelled.
 */
export async function exportFlashcardsTsv(lectureId: string): Promise<string | null> {
  return invoke<string | null>("export_flashcards_tsv", { lectureId });
}

/**
 * Save a quiz attempt record (answers JSON and score) to the database.
 * Returns the id of the saved record.
 */
export async function saveQuizAttempt(
  lectureId: string,
  answersJson: string,
  score: number,
  totalQuestions: number,
): Promise<string> {
  return invoke<string>("save_quiz_attempt", { lectureId, answersJson, score, totalQuestions });
}
