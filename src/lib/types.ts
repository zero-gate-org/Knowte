export type ThemeMode = "dark" | "light";

export interface Settings {
  ollama_url: string;
  whisper_model: string;
  llm_model: string;
  llm_timeout_seconds: number;
  personalization_level: string;
  language: string;
  export_path: string;
  enable_research: boolean;
  theme: ThemeMode;
  delete_audio_after_processing: boolean;
}

export interface OllamaStatus {
  connected: boolean;
  models: string[];
  error: string | null;
}

export type LectureSourceType = "audio" | "video";

export interface AudioFileMetadata {
  id: string;
  filename: string;
  path: string;
  duration_seconds: number;
  size_bytes: number;
  source_type: LectureSourceType;
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
  chunk_index?: number;
  chunk_total?: number;
  chunk_percent?: number;
  eta_seconds?: number | null;
  realtime_factor?: number | null;
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

/** Emitted as `explain-stream` while contextual explanation is generated */
export interface ExplainStreamEvent {
  token: string;
  done: boolean;
}

export interface ExplainHistoryEntry {
  id: string;
  selectedText: string;
  context: string;
  explanation: string;
  level: string;
  createdAt: number;
  isStreaming: boolean;
  error?: string;
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
  paper_id: string;
  title: string;
  abstract_text: string | null;
  year: number | null;
  authors: string[];
  url: string;
  citation_count: number;
  venue: string | null;
  pdf_url: string | null;
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

export interface MergedFlashcardsResult {
  cards: Flashcard[];
  source_count: number;
  duplicate_count: number;
}

// Keywords (matches extract_keywords prompt schema)
export interface KeywordsOutput {
  keywords: string[];
}

// ─── Pipeline types ─────────────────────────────────────────────────────────

/** Emitted as `pipeline-stage` Tauri event at the start/end of each stage */
export interface PipelineStageEvent {
  lecture_id: string;
  /** e.g. "summary" | "notes" | "quiz" | "flashcards" | "mindmap" | "keywords" | "pipeline" */
  stage: string;
  /** "starting" | "complete" | "error" | "warning" */
  status: string;
  preview?: string;
  error?: string;
  /** How many stages have been completed so far (0-6) */
  stages_complete: number;
}

export type PipelineStageStatus = "pending" | "running" | "complete" | "error";

export interface PipelineStage {
  name: string;
  label: string;
  status: PipelineStageStatus;
  preview?: string;
  error?: string;
}

/** Matches the PipelineStageRecord from Rust */
export interface PipelineStageRecord {
  id: string;
  lecture_id: string;
  stage_name: string;
  status: string;
  result_preview?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface StorageUsage {
  app_data_dir: string;
  app_data_bytes: number;
  lectures_bytes: number;
  prepared_audio_bytes: number;
  free_bytes: number;
}

export interface PipelineEstimate {
  lecture_id: string;
  transcript_words: number;
  token_estimate: number;
  estimated_minutes_min: number;
  estimated_minutes_max: number;
  has_cached_results: boolean;
  cached_stage_count: number;
  is_long_transcript: boolean;
}

export type LectureStatus =
  | "uploaded"
  | "transcribing"
  | "processing"
  | "complete"
  | "error";

export interface LectureSummary {
  id: string;
  title: string;
  filename: string;
  duration: number;
  status: LectureStatus;
  created_at: string;
  audio_path: string;
  source_type: LectureSourceType;
  summary?: string;
  stages_complete: number;
}

export interface Lecture {
  id: string;
  title?: string;
  filename: string;
  audioPath: string;
  sourceType: LectureSourceType;
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
  stagesComplete?: number;
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
  llm_timeout_seconds: 300,
  personalization_level: "undergraduate_2nd_year",
  language: "en",
  export_path: "",
  enable_research: true,
  theme: "dark",
  delete_audio_after_processing: false,
};
