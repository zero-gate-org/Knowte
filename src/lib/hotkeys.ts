export const LECTURE_VIEW_SHORTCUTS = [
  { key: "1", label: "Transcript", segment: "transcript" },
  { key: "2", label: "Pipeline", segment: "pipeline" },
  { key: "3", label: "Notes", segment: "notes" },
  { key: "4", label: "Quiz", segment: "quiz" },
  { key: "5", label: "Research", segment: "research" },
  { key: "6", label: "Mind Map", segment: "mindmap" },
  { key: "7", label: "Flashcards", segment: "flashcards" },
] as const;

export const GLOBAL_SHORTCUTS = [
  { keys: "Ctrl+N", action: "New knowte (Upload)" },
  { keys: "Ctrl+H", action: "Go to Library" },
  { keys: "Ctrl+,", action: "Open Settings" },
  { keys: "Ctrl+Shift+E", action: "Export current view data" },
  { keys: "Space", action: "Play/pause audio (Transcript)" },
  { keys: "Esc", action: "Close dialogs and stop recording" },
  { keys: "?", action: "Open keyboard shortcuts" },
  { keys: "← / →", action: "Previous/next item (Quiz/Flashcards)" },
] as const;

export type LectureShortcutSegment = (typeof LECTURE_VIEW_SHORTCUTS)[number]["segment"];

export const HOTKEY_EVENT_NAMES = {
  toggleTranscriptPlayback: "knowte:hotkey:toggle-transcript-playback",
  previousFlashcard: "knowte:hotkey:previous-flashcard",
  nextFlashcard: "knowte:hotkey:next-flashcard",
  previousQuizQuestion: "knowte:hotkey:previous-quiz-question",
  nextQuizQuestion: "knowte:hotkey:next-quiz-question",
  stopRecording: "knowte:hotkey:stop-recording",
} as const;
