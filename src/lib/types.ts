export interface Settings {
  ollama_url: string;
  whisper_model: string;
  llm_model: string;
  personalization_level: string;
  language: string;
  export_path: string;
}

export interface OllamaStatus {
  connected: boolean;
  models: string[];
  error: string | null;
}

export interface AudioFileMetadata {
  id: string;
  filename: string;
  path: string;
  duration_seconds: number;
  size_bytes: number;
}

export interface WhisperDownloadProgress {
  percent: number;
  model_size: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionProgress {
  lecture_id: string;
  percent: number;
}

export interface TranscriptionResult {
  transcript_id: string;
  lecture_id: string;
  full_text: string;
  segments: TranscriptSegment[];
  model_used: string;
}

export interface TranscriptUpdateResult {
  transcript_id: string;
  lecture_id: string;
  full_text: string;
  segments: TranscriptSegment[];
}

// ─── LLM / Pipeline types ───────────────────────────────────────────────────

/** Emitted as `llm-stream` Tauri event while the model generates tokens */
export interface LlmStreamEvent {
  lecture_id: string;
  stage: string;
  token: string;
  done: boolean;
}

// Structured Notes (matches prompt schema)
export interface NotesTopic {
  heading: string;
  key_points: string[];
  details: string;
  examples: string[];
}

export interface NotesTerm {
  term: string;
  definition: string;
}

export interface StructuredNotes {
  title: string;
  topics: NotesTopic[];
  key_terms: NotesTerm[];
  takeaways: string[];
}

// Quiz (matches prompt schema)
export type QuestionType = "multiple_choice" | "short_answer" | "true_false";
export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface Question {
  id: number;
  type: QuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string;
  difficulty: QuestionDifficulty;
}

export interface Quiz {
  questions: Question[];
}

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  year?: number;
  url?: string;
}

export interface MindMapNode {
  id: string;
  label: string;
  children?: MindMapNode[];
}

export interface MindMapData {
  root: MindMapNode;
}

// Flashcard (matches prompt schema)
export interface Flashcard {
  front: string;
  back: string;
  tags: string[];
}

export interface FlashcardsOutput {
  cards: Flashcard[];
}

// Keywords (matches extract_keywords prompt schema)
export interface KeywordsOutput {
  keywords: string[];
}

export type LectureStatus =
  | "uploaded"
  | "transcribing"
  | "processing"
  | "complete"
  | "error";

export interface Lecture {
  id: string;
  filename: string;
  audioPath: string;
  duration: number;
  status: LectureStatus;
  transcriptId?: string;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  originalTranscriptSegments?: TranscriptSegment[];
  summary?: string;
  notes?: StructuredNotes;
  quiz?: Quiz;
  papers?: Paper[];
  mindmap?: MindMapData;
  flashcards?: Flashcard[];
  createdAt: string;
  error?: string;
}

export const PERSONALIZATION_LEVELS = [
  { value: "high_school", label: "High School" },
  { value: "undergraduate_1st_year", label: "Undergraduate 1st Year" },
  { value: "undergraduate_2nd_year", label: "Undergraduate 2nd Year" },
  { value: "undergraduate_3rd_year", label: "Undergraduate 3rd Year" },
  { value: "graduate", label: "Graduate" },
  { value: "phd_researcher", label: "PhD Researcher" },
] as const;

export const WHISPER_MODELS = [
  { value: "tiny", label: "Tiny (fastest, least accurate)" },
  { value: "base", label: "Base (recommended)" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large (slowest, most accurate)" },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  ollama_url: "http://localhost:11434",
  whisper_model: "base",
  llm_model: "llama3.1:8b",
  personalization_level: "undergraduate_2nd_year",
  language: "en",
  export_path: "",
};
