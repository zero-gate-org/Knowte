# Cognote — AI Agent Development Plan

## Architecture Decision Record

```
Runtime:         Tauri v2 (Rust backend + Web frontend)
Frontend:        React + TypeScript + Tailwind CSS
Local LLM:       Ollama (llama3.1 / mistral / phi-3)
Transcription:   whisper.cpp (via rust bindings) or OpenAI Whisper.cpp CLI
Database:        SQLite via rusqlite (all data local)
Search API:      Semantic Scholar Academic Graph API (only external call)
Export formats:  Anki (.apkg), Markdown, JSON, HTML mind-map
```

---

## Project File Structure (Target End-State)

```
cognote/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                  # Tauri entry point
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   ├── transcribe.rs        # Whisper integration
│   │   │   ├── llm.rs               # Ollama client
│   │   │   ├── summarize.rs         # Summarization pipeline
│   │   │   ├── quiz.rs              # Quiz generation
│   │   │   ├── notes.rs             # Structured notes generation
│   │   │   ├── flashcards.rs        # Anki export
│   │   │   ├── mindmap.rs           # Mind-map data generation
│   │   │   ├── research.rs          # Semantic Scholar API
│   │   │   ├── audio.rs             # Mic recording + file handling
│   │   │   └── settings.rs          # User preferences
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs
│   │   │   └── queries.rs
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   ├── lecture.rs
│   │   │   ├── quiz.rs
│   │   │   ├── flashcard.rs
│   │   │   └── note.rs
│   │   ├── pipeline/
│   │   │   ├── mod.rs
│   │   │   └── orchestrator.rs      # Full pipeline coordinator
│   │   └── utils/
│   │       ├── mod.rs
│   │       ├── prompt_templates.rs  # All LLM prompts
│   │       └── anki_export.rs       # .apkg file builder
│   ├── whisper-models/              # Downloaded whisper models
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MainContent.tsx
│   │   ├── Upload/
│   │   │   ├── AudioUploader.tsx
│   │   │   ├── LiveRecorder.tsx
│   │   │   └── DropZone.tsx
│   │   ├── Transcript/
│   │   │   ├── TranscriptViewer.tsx
│   │   │   └── TranscriptEditor.tsx
│   │   ├── Notes/
│   │   │   ├── StructuredNotes.tsx
│   │   │   └── NotesExport.tsx
│   │   ├── Quiz/
│   │   │   ├── QuizPlayer.tsx
│   │   │   ├── QuizResults.tsx
│   │   │   └── QuestionCard.tsx
│   │   ├── Research/
│   │   │   ├── PaperList.tsx
│   │   │   └── PaperCard.tsx
│   │   ├── MindMap/
│   │   │   └── MindMapCanvas.tsx
│   │   ├── Flashcards/
│   │   │   ├── FlashcardViewer.tsx
│   │   │   └── AnkiExport.tsx
│   │   ├── Settings/
│   │   │   ├── SettingsPanel.tsx
│   │   │   ├── ModelSelector.tsx
│   │   │   └── PersonalizationConfig.tsx
│   │   └── Pipeline/
│   │       ├── ProgressTracker.tsx
│   │       └── StageIndicator.tsx
│   ├── hooks/
│   │   ├── useTauriCommand.ts
│   │   ├── usePipeline.ts
│   │   ├── useAudioRecorder.ts
│   │   └── useLectureStore.ts
│   ├── stores/
│   │   ├── lectureStore.ts          # Zustand store
│   │   ├── settingsStore.ts
│   │   └── pipelineStore.ts
│   ├── lib/
│   │   ├── tauriApi.ts              # Typed Tauri invoke wrappers
│   │   ├── types.ts                 # Shared TypeScript types
│   │   └── constants.ts
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

---

## PHASE 1: Foundation Shell

**Goal: Working desktop window with navigation, settings page that connects to Ollama, and audio file acceptance.**

### Task 1.1 — Tauri + React Scaffold

```
PROMPT FOR AGENT:
─────────────────
Create a Tauri v2 desktop app with React + TypeScript + Vite frontend.

Requirements:
- Tauri v2 with default config, window title "LectureToLearn"
- Window size 1200x800, resizable, centered on launch
- React 18 with TypeScript strict mode
- Tailwind CSS v3 configured
- Zustand for state management (install, don't configure stores yet)
- Vite as bundler (Tauri v2 default)
- Create the full folder structure for src/ and src-tauri/src/
  with empty mod.rs files and placeholder component files
- Add a simple App.tsx with a sidebar layout (Sidebar + MainContent area)
- Sidebar has 7 nav items: Upload, Transcript, Notes, Quiz, 
  Research, Mind Map, Flashcards, Settings — each just renders
  a placeholder <h1> in the main content area
- Use react-router-dom for routing between these views
- Dark theme by default using Tailwind (slate-900 bg, slate-100 text)

Do NOT set up any backend logic yet. Just the shell.
```

**Acceptance Criteria:**
- [ ] `npm run tauri dev` opens a desktop window
- [ ] Sidebar navigation switches between 8 placeholder views
- [ ] Dark theme renders correctly
- [ ] All folder structure directories exist

---

### Task 1.2 — Settings Page + Ollama Health Check

```
PROMPT FOR AGENT:
─────────────────
Build the Settings page and Ollama connection layer.

BACKEND (src-tauri/src/commands/settings.rs):
- Create a Tauri command `check_ollama_status` that sends GET to 
  http://localhost:11434/api/tags and returns the list of available 
  model names, or an error message if Ollama is unreachable
- Create a Tauri command `get_settings` that reads from a JSON file 
  at the app's data directory (use tauri::api::path::app_data_dir)
  Settings schema:
  {
    "ollama_url": "http://localhost:11434",
    "whisper_model": "base",        // tiny|base|small|medium|large
    "llm_model": "llama3.1:8b",     // from Ollama
    "personalization_level": "undergraduate_2nd_year",
    "language": "en",
    "export_path": ""               // default to ~/Documents/LectureToLearn
  }
- Create a Tauri command `save_settings` that writes to the same file
- If settings file doesn't exist, create it with defaults on first read

FRONTEND (src/components/Settings/):
- SettingsPanel.tsx: Form with fields for all settings above
- ModelSelector.tsx: Dropdown that populates from `check_ollama_status` 
  result. Show a green dot if connected, red dot if not.
- PersonalizationConfig.tsx: Dropdown with options:
  "High school", "Undergraduate 1st year", "Undergraduate 2nd year",
  "Undergraduate 3rd year", "Graduate", "PhD researcher"
  This maps to prompt personalization later.
- Save button calls `save_settings`, shows toast on success
- On mount, call `get_settings` to populate form

STORE (src/stores/settingsStore.ts):
- Zustand store holding all settings + loading/error state
- Actions: loadSettings(), saveSettings(), checkOllama()

Wire everything together. Settings should persist across app restarts.
```

**Acceptance Criteria:**
- [ ] Settings page shows Ollama connection status (green/red dot)
- [ ] Available Ollama models appear in dropdown when Ollama is running
- [ ] Settings save to disk and reload on app restart
- [ ] Personalization level selector works

---

### Task 1.3 — Audio Upload + Live Mic Recording

```
PROMPT FOR AGENT:
─────────────────
Build the audio input system — file upload and live microphone recording.

BACKEND (src-tauri/src/commands/audio.rs):
- Tauri command `accept_audio_file(path: String)` that:
  - Validates file exists and is .mp3, .wav, .m4a, .ogg, .webm, .mp4
  - Copies file to app_data_dir/lectures/{uuid}.{ext}
  - Returns { id: uuid, filename, path, duration_seconds, size_bytes }
  - Use symphonia crate for reading audio metadata (duration)
- Tauri command `start_recording()` that:
  - Uses cpal crate to capture default input device audio
  - Writes to app_data_dir/lectures/{uuid}.wav in real-time
  - Returns the recording_id (uuid)
- Tauri command `stop_recording(recording_id: String)` that:
  - Stops the cpal stream
  - Returns the same metadata as accept_audio_file
- Add proper error handling with thiserror crate

FRONTEND (src/components/Upload/):
- DropZone.tsx: Drag-and-drop area that accepts audio/video files.
  Also has a "Browse files" button. On drop/select, calls 
  accept_audio_file via Tauri invoke.
- LiveRecorder.tsx: Big red record button. Shows elapsed time 
  while recording. Waveform visualization using Web Audio API 
  analyser node (simple bar visualization, no external lib).
  Stop button saves recording.
- AudioUploader.tsx: Parent component that has two tabs —
  "Upload File" and "Record Live". After successful audio input,
  shows file info card and a "Process Lecture" button.

STORE (src/stores/lectureStore.ts):
- Define the lecture type:
  {
    id: string,
    filename: string,
    audioPath: string,
    duration: number,
    status: 'uploaded' | 'transcribing' | 'processing' | 'complete' | 'error',
    transcript?: string,
    summary?: string,
    notes?: StructuredNotes,
    quiz?: Quiz,
    papers?: Paper[],
    mindmap?: MindMapData,
    flashcards?: Flashcard[],
    createdAt: string,
    error?: string
  }
- Store holds: lectures[], currentLectureId, loading states
- Actions: addLecture(), setCurrentLecture(), updateLecture()

TYPES (src/lib/types.ts):
- Define all TypeScript interfaces matching the above
- Also define: StructuredNotes, Quiz, Question, Paper, 
  MindMapNode, Flashcard types (just interfaces, not used yet)

The "Process Lecture" button should exist but does nothing yet —
it will trigger the pipeline in Phase 2.
```

**Acceptance Criteria:**
- [ ] Can drag-and-drop an audio file and see its info displayed
- [ ] Can record from microphone with visual feedback
- [ ] Audio files are saved to the app data directory
- [ ] Duration and file size display correctly
- [ ] "Process Lecture" button appears after upload/record

---

## PHASE 2: Transcription Engine

**Goal: Audio → accurate text transcript using local Whisper, with progress feedback.**

### Task 2.1 — Whisper.cpp Integration

```
PROMPT FOR AGENT:
─────────────────
Integrate whisper.cpp for local audio transcription.

BACKEND (src-tauri/src/commands/transcribe.rs):
- Use the `whisper-rs` crate (Rust bindings for whisper.cpp)
- Tauri command `download_whisper_model(model_size: String)`:
  - Downloads the specified model (tiny/base/small/medium/large) 
    from huggingface to src-tauri/whisper-models/
  - Emits progress events to frontend via Tauri event system:
    app.emit("whisper-download-progress", { percent, model_size })
  - Returns path to downloaded model file
  - Skip download if model already exists at path
  
- Tauri command `check_whisper_models()`:
  - Returns list of already-downloaded model files
  
- Tauri command `transcribe_audio(lecture_id: String)`:
  - Reads settings to get whisper model size and audio path
  - Converts audio to 16kHz mono WAV if needed (use hound + rubato crates,
    or shell out to ffmpeg if available with fallback)
  - Runs whisper-rs with:
    - Language from settings (or auto-detect)
    - Token-level timestamps
    - Progress callback that emits events:
      app.emit("transcription-progress", { lecture_id, percent })
  - Returns full transcript text AND segments array:
    [{ start: f64, end: f64, text: String }]
  - On completion, save transcript to SQLite database
  - This should run in a background thread (don't block UI)

DATABASE (src-tauri/src/db/):
- schema.rs: Create SQLite schema with tables:
  lectures (id, filename, audio_path, duration, status, created_at)
  transcripts (id, lecture_id, full_text, segments_json, model_used, created_at)
  Segments stored as JSON text column.
- queries.rs: Functions for insert/update/select on both tables
- mod.rs: Initialize database connection, run migrations on app start

Update main.rs:
- Initialize SQLite database on app startup
- Register all new commands

FRONTEND updates:
- Add a model download section in Settings (shows which whisper models 
  are downloaded, button to download each size with progress bar)
- src/components/Transcript/TranscriptViewer.tsx:
  - Shows transcript with timestamp segments
  - Each segment is clickable (future: will link to audio playback)
  - Searchable with Ctrl+F style search box
  - Copy-all button
- src/components/Pipeline/ProgressTracker.tsx:
  - Listens to Tauri events for transcription-progress
  - Shows a progress bar with current stage label
  - "Transcribing audio... 45%"

When user clicks "Process Lecture" on the Upload page:
- Update lecture status to 'transcribing'
- Call transcribe_audio
- On completion, navigate to Transcript view
- Save transcript to store and database
```

**Acceptance Criteria:**
- [ ] Can download whisper base model from Settings page with progress
- [ ] 5-minute audio file transcribes successfully with progress updates
- [ ] Transcript displays with timestamps in the Transcript view
- [ ] Transcript persists in SQLite (survives app restart)
- [ ] Audio conversion to 16kHz mono works for mp3/m4a/wav inputs
- [ ] UI remains responsive during transcription (background thread)

---

### Task 2.2 — Transcript Editing + Audio Sync

```
PROMPT FOR AGENT:
─────────────────
Add transcript editing and basic audio playback synced to segments.

FRONTEND (src/components/Transcript/TranscriptEditor.tsx):
- Editable mode toggle on TranscriptViewer
- In edit mode, each segment's text becomes a contenteditable div
- Changes auto-save after 1 second debounce
- "Reset to original" button per segment

FRONTEND — Audio player bar:
- Fixed bottom bar when viewing a lecture (like a music player)
- Play/pause, seek bar, playback speed (0.5x, 1x, 1.25x, 1.5x, 2x)
- Current segment highlighted in transcript view as audio plays
- Click a segment → audio seeks to that timestamp
- Use HTML5 Audio element pointing to the local file via 
  Tauri's asset protocol (convertFileSrc)

BACKEND:
- Tauri command `update_transcript_segment(transcript_id, segment_index, new_text)`:
  Updates the segment in the database
- Tauri command `get_lecture_audio_url(lecture_id)` that returns 
  the asset:// URL for the audio file

Keep the TranscriptViewer as default (read-only), TranscriptEditor 
as the editable version. Toggle between them with an Edit button.
```

**Acceptance Criteria:**
- [ ] Audio plays back with seek and speed controls
- [ ] Current transcript segment highlights during playback
- [ ] Clicking a segment seeks audio to that time
- [ ] Can edit transcript text and changes save to database
- [ ] Speed controls (0.5x–2x) work correctly

---

## PHASE 3: LLM Processing Pipeline

**Goal: Transcript → structured notes, quiz, flashcards, mind-map data using local Ollama models with streaming.**

### Task 3.1 — Prompt Templates + Ollama Client

```
PROMPT FOR AGENT:
─────────────────
Build the Ollama client and all prompt templates.

BACKEND (src-tauri/src/utils/prompt_templates.rs):
Define prompt template functions. Each takes the transcript text 
and a personalization_level string and returns the full prompt.

All prompts should include this personalization preamble:
"You are an expert educational assistant. Adapt your language and 
explanations for a student at the {level} level. Be precise, 
clear, and pedagogically sound."

Where {level} maps:
- "high_school" → "high school student (ages 15-18)"
- "undergraduate_1st_year" → "first-year university student"
- "undergraduate_2nd_year" → "second-year university student"  
- "undergraduate_3rd_year" → "third-year university student"
- "graduate" → "graduate/masters student"
- "phd_researcher" → "PhD researcher"

PROMPTS TO CREATE:

1. summarize_prompt(transcript, level) → 
   "Create a concise summary of this lecture in 3-5 paragraphs.
    Highlight the main thesis, key arguments, and conclusions.
    Lecture transcript: {transcript}"

2. structured_notes_prompt(transcript, level) →
   "Generate structured lecture notes from this transcript.
    Output as JSON with this exact schema:
    {
      "title": "string",
      "topics": [
        {
          "heading": "string",
          "key_points": ["string"],
          "details": "string",
          "examples": ["string"]
        }
      ],
      "key_terms": [
        { "term": "string", "definition": "string" }
      ],
      "takeaways": ["string"]
    }
    Only output valid JSON, nothing else.
    Transcript: {transcript}"

3. quiz_prompt(transcript, level) →
   "Generate exactly 10 quiz questions from this lecture transcript.
    Mix of types: 5 multiple choice, 3 short answer, 2 true/false.
    Output as JSON:
    {
      "questions": [
        {
          "id": number,
          "type": "multiple_choice" | "short_answer" | "true_false",
          "question": "string",
          "options": ["string"] | null,
          "correct_answer": "string",
          "explanation": "string",
          "difficulty": "easy" | "medium" | "hard"
        }
      ]
    }
    Only output valid JSON.
    Transcript: {transcript}"

4. flashcards_prompt(transcript, level) →
   "Generate 15-20 Anki-style flashcards from this lecture.
    Output as JSON:
    {
      "cards": [
        {
          "front": "string (question or concept)",
          "back": "string (answer or explanation)",
          "tags": ["string"]
        }
      ]
    }
    Only output valid JSON.
    Transcript: {transcript}"

5. mindmap_prompt(transcript, level) →
   "Create a hierarchical mind map structure from this lecture.
    Output as JSON:
    {
      "root": {
        "label": "string (main topic)",
        "children": [
          {
            "label": "string",
            "children": [
              { "label": "string", "children": [] }
            ]
          }
        ]
      }
    }
    Only output valid JSON.
    Transcript: {transcript}"

6. extract_keywords_prompt(transcript) →
   "Extract 5-10 academic keywords/key phrases from this lecture 
    that would be good search terms for finding related research 
    papers. Return as JSON: { "keywords": ["string"] }
    Only output valid JSON.
    Transcript: {transcript}"

BACKEND (src-tauri/src/commands/llm.rs):
- Create an OllamaClient struct with methods:
  - new(base_url: String) → Self
  - generate(model: String, prompt: String, lecture_id: String, stage: String) 
    → Result<String>
    Uses POST to /api/generate with stream: true
    Emits Tauri events as tokens arrive:
    app.emit("llm-stream", { lecture_id, stage, token, done })
    Returns full accumulated response
  - is_available() → bool

- Add a helper function `parse_json_from_response(response: &str) → String`
  that extracts JSON from the response even if the LLM wraps it in 
  markdown code blocks or adds extra text. Find the first { and last } 
  (or first [ and last ]) and extract that substring.

Handle these error cases:
- Ollama not running → clear error message
- Model not downloaded → suggest running `ollama pull {model}`
- Response doesn't contain valid JSON → retry once with a 
  "Please output ONLY valid JSON" appended prompt
- Timeout after 5 minutes → error

Write thorough error types in a custom error enum using thiserror.
```

**Acceptance Criteria:**
- [ ] All 6 prompt templates generate proper prompts with personalization
- [ ] OllamaClient successfully streams responses from Ollama
- [ ] JSON extraction handles markdown-wrapped responses
- [ ] Retry logic works when JSON parsing fails
- [ ] Stream events arrive at frontend

---

### Task 3.2 — Pipeline Orchestrator

```
PROMPT FOR AGENT:
─────────────────
Build the pipeline orchestrator that runs all processing stages 
sequentially after transcription.

BACKEND (src-tauri/src/pipeline/orchestrator.rs):
Create a function `run_full_pipeline(lecture_id: String, app: AppHandle)` 
that executes these stages in order:

Stage 1: Summarize
  - Call LLM with summarize_prompt
  - Save summary text to database (add summary column to lectures table)
  - Emit event: ("pipeline-stage", { lecture_id, stage: "summary", status: "complete" })

Stage 2: Structured Notes  
  - Call LLM with structured_notes_prompt
  - Parse JSON response into StructuredNotes struct
  - Save to database (new table: notes with lecture_id, notes_json)
  - Emit stage complete event

Stage 3: Quiz
  - Call LLM with quiz_prompt
  - Parse JSON into Quiz struct
  - Save to database (new table: quizzes with lecture_id, quiz_json)
  - Emit stage complete event

Stage 4: Flashcards
  - Call LLM with flashcards_prompt
  - Parse JSON into Vec<Flashcard>
  - Save to database (new table: flashcards with lecture_id, cards_json)
  - Emit stage complete event

Stage 5: Mind Map
  - Call LLM with mindmap_prompt
  - Parse JSON into MindMapData
  - Save to database (new table: mindmaps with lecture_id, mindmap_json)
  - Emit stage complete event

Stage 6: Research Keywords
  - Call LLM with extract_keywords_prompt
  - Pass keywords to Semantic Scholar search (next task)
  - Save results to database
  - Emit stage complete event

Each stage should:
  - Emit a "starting" event before calling LLM
  - Handle errors gracefully — if one stage fails, log error, 
    continue to next stage, mark that stage as "error"
  - Track total pipeline progress (stage X of 6)

BACKEND (src-tauri/src/commands/): Create a new command:
- `start_pipeline(lecture_id: String)` that spawns the orchestrator
  in a background async task and returns immediately
- `get_pipeline_status(lecture_id: String)` that returns current 
  stage statuses from the database

DATABASE updates:
- Add a pipeline_stages table:
  (id, lecture_id, stage_name, status, result_preview, error, started_at, completed_at)
- Update all query functions

MODELS (src-tauri/src/models/):
- Define Rust structs with serde Serialize/Deserialize for:
  StructuredNotes, Topic, KeyTerm, Quiz, Question, Flashcard, 
  MindMapNode, MindMapData — matching the JSON schemas from prompts

FRONTEND (src/components/Pipeline/ProgressTracker.tsx):
- Full pipeline progress view showing all 6 stages
- Each stage shows: pending → running (with spinner) → complete ✓ → error ✗
- Running stage shows streaming LLM output in a small preview box
- Overall progress bar (0-100% across all stages)
- This appears after clicking "Process Lecture" on Upload page
- When pipeline completes, show "View Results" button that goes to Notes

FRONTEND — update the "Process Lecture" button:
- Now calls start_pipeline
- Navigates to the Pipeline progress view
- Disables the button if pipeline already running

Handle the case where transcript is very long (>8000 tokens):
- In orchestrator, add a function that chunks the transcript into 
  ~4000 token segments (rough estimate: 1 token ≈ 4 chars)
- For summarization: summarize each chunk, then summarize the summaries
- For other stages: use the combined summary + first chunk 
  (with a note about total lecture scope)
```

**Acceptance Criteria:**
- [ ] Full pipeline runs all 6 stages sequentially
- [ ] Progress events stream to frontend in real-time
- [ ] Failed stages don't crash the pipeline
- [ ] Long transcripts are chunked properly
- [ ] All results save to SQLite
- [ ] Pipeline progress view shows stage-by-stage status
- [ ] LLM streaming output visible during processing

---

### Task 3.3 — Semantic Scholar Integration

```
PROMPT FOR AGENT:
─────────────────
Integrate Semantic Scholar API for finding related research papers.

BACKEND (src-tauri/src/commands/research.rs):
- Semantic Scholar Academic Graph API (free, no auth required for 
  basic usage, but rate limited to 100 req/5min)
- Base URL: https://api.semanticscholar.org/graph/v1

Create these functions:

1. `search_papers(keywords: Vec<String>, limit: usize)` → Vec<Paper>
   - Endpoint: GET /paper/search?query={keywords_joined}&limit={limit}&fields=
     title,abstract,year,authors,url,citationCount,venue,openAccessPdf
   - For each keyword, search with limit 3, deduplicate by paperId
   - Return top 10 unique papers sorted by citation count
   - Add error handling for rate limits (429) — wait and retry

2. Paper struct:
   {
     paper_id: String,
     title: String,
     abstract_text: Option<String>,
     year: Option<i32>,
     authors: Vec<String>,  // just names
     url: String,
     citation_count: i32,
     venue: Option<String>,
     pdf_url: Option<String>
   }

3. Tauri command `search_related_papers(lecture_id: String)`:
   - Reads keywords from the pipeline results in database
   - Calls search_papers
   - Saves results to database (new table: papers)
   - Returns the papers

4. Tauri command `get_lecture_papers(lecture_id: String)`:
   - Returns saved papers from database

FRONTEND (src/components/Research/):
- PaperList.tsx: Grid/list of paper cards
  - Sort by: relevance, citations, year
  - Filter by: has PDF, year range
- PaperCard.tsx: Shows title, authors, year, venue, citation count
  - "View Abstract" expandable section  
  - "Open Paper" button → opens URL in system browser
  - "Download PDF" button if pdf_url exists → downloads via Tauri
  - Subtle relevance indicator

Add a "Refresh Papers" button that re-runs the search.

IMPORTANT: This is the ONLY external network call in the app.
Add a toggle in Settings: "Enable research paper search (requires internet)"
If disabled, skip Stage 6 in pipeline and show a message in Research tab.
```

**Acceptance Criteria:**
- [ ] Keywords from lecture successfully find relevant papers
- [ ] Paper cards display all metadata correctly
- [ ] "Open Paper" opens in system browser
- [ ] Works offline gracefully (shows message, doesn't crash)
- [ ] Rate limiting handled with retry
- [ ] Can disable feature in settings

---

## PHASE 4: Output Views & Exports

**Goal: Rich interactive views for all generated content + export functionality.**

### Task 4.1 — Structured Notes View

```
PROMPT FOR AGENT:
─────────────────
Build the structured notes display and export.

FRONTEND (src/components/Notes/StructuredNotes.tsx):
- Renders the StructuredNotes JSON as a beautiful document:
  - Title as h1
  - Summary section (from lecture summary)
  - Each topic as a collapsible section with:
    - Heading as h2
    - Key points as a styled bullet list (with colored bullets)
    - Details as paragraph text
    - Examples in a distinct styled box (light blue bg, rounded)
  - Key Terms section: two-column table (term | definition)
    with alternating row colors
  - Takeaways as a numbered list in a highlight box
- Table of contents sidebar (sticky, scrolls with content)
  that links to each section
- Typography should be excellent — proper line height, font sizes,
  spacing for readability

FRONTEND (src/components/Notes/NotesExport.tsx):
- Export buttons row at the top:
  - "Copy as Markdown" → converts notes JSON to clean markdown, 
    copies to clipboard
  - "Download as Markdown" → saves .md file via Tauri save dialog
  - "Download as PDF" → uses window.print() with a print-optimized 
    CSS stylesheet (hide sidebar, proper margins)
- Toast notification on successful export

BACKEND:
- Tauri command `export_notes_markdown(lecture_id: String, path: String)`:
  Reads notes from DB, converts to markdown string, writes to file
- Tauri command `get_lecture_notes(lecture_id: String)`:
  Returns the structured notes JSON from database

Add a "Regenerate Notes" button that re-runs just the notes stage
of the pipeline (calls LLM again with same transcript).
```

**Acceptance Criteria:**
- [ ] Notes render beautifully with proper hierarchy
- [ ] Table of contents navigation works
- [ ] Markdown export produces clean, readable markdown
- [ ] Regeneration works and updates the display
- [ ] Collapsible sections work smoothly

---

### Task 4.2 — Interactive Quiz

```
PROMPT FOR AGENT:
─────────────────
Build the interactive quiz player.

FRONTEND (src/components/Quiz/):

QuizPlayer.tsx:
- Shows one question at a time (card-based layout)
- Question number and total (e.g., "Question 3 of 10")
- Progress bar at top
- For multiple choice: radio buttons styled as cards
- For true/false: two large buttons (True / False)
- For short answer: text input field
- "Submit Answer" button per question
- After submitting:
  - Correct: green highlight + confetti-like subtle animation 
    (just a green border flash, keep it simple)
  - Incorrect: red highlight + show correct answer
  - Show explanation text below
- "Next Question" button to advance
- Navigation dots at bottom to jump between questions
- Questions can be answered in any order

QuizResults.tsx:
- After all questions answered, show results screen:
  - Score: X/10 with a circular progress indicator
  - Color coded: green (>70%), yellow (50-70%), red (<50%)
  - List of all questions with ✓ or ✗
  - Expandable explanations for wrong answers
  - "Retake Quiz" button (resets all answers)
  - "Generate New Quiz" button (calls LLM again)

QuestionCard.tsx:
- Reusable question display component
- Handles all three question types
- Shows difficulty badge (easy/medium/hard)

BACKEND:
- Tauri command `get_lecture_quiz(lecture_id: String)` → Quiz JSON
- Tauri command `regenerate_quiz(lecture_id: String)` → 
  re-runs quiz prompt, saves new quiz, returns it
- Tauri command `save_quiz_attempt(lecture_id, answers_json, score)`:
  Saves to a quiz_attempts table for history

STORE updates:
- Track current quiz state: current_question_index, 
  user_answers: Map<question_id, user_answer>, submitted: Set<question_id>
```

**Acceptance Criteria:**
- [ ] All three question types render and accept input correctly
- [ ] Submit shows correct/incorrect with explanation
- [ ] Can navigate between questions freely
- [ ] Results page shows accurate score
- [ ] Can retake or generate new quiz
- [ ] Quiz attempts save to database

---

### Task 4.3 — Mind Map Visualization

```
PROMPT FOR AGENT:
─────────────────
Build an interactive mind map visualization.

FRONTEND (src/components/MindMap/MindMapCanvas.tsx):
- Use the `reactflow` library (npm install reactflow)
- Convert the MindMapData JSON tree into ReactFlow nodes and edges:
  - Root node: large, centered, distinct color (indigo)
  - Level 1 children: medium size, arranged radially, blue
  - Level 2 children: smaller, green
  - Level 3+: smallest, gray
- Auto-layout using dagre (npm install dagre @types/dagre) 
  for tree layout
- Features:
  - Zoom in/out with scroll wheel
  - Pan by dragging background  
  - Click a node to highlight its branch
  - Minimap in bottom-right corner
  - "Fit View" button to reset zoom
  - "Download as PNG" button using html-to-image library
  - "Download as SVG" button
- Nodes should have rounded corners, subtle shadows, and 
  the text should be readable at default zoom
- Edges should be smooth bezier curves

BACKEND:
- Tauri command `get_lecture_mindmap(lecture_id: String)` → MindMapData JSON
- Tauri command `export_mindmap_svg(lecture_id, path)` → 
  generates SVG string from the tree data (basic SVG generation 
  in Rust, or just let frontend handle it)

If mind map data is missing (stage failed), show an 
"Generate Mind Map" button that runs just that pipeline stage.
```

**Acceptance Criteria:**
- [ ] Mind map renders from LLM-generated data
- [ ] Zoom, pan, and fit-view work smoothly
- [ ] Auto-layout produces readable tree structure
- [ ] PNG/SVG export works
- [ ] Minimap shows overview

---

### Task 4.4 — Flashcards + Anki Export

```
PROMPT FOR AGENT:
─────────────────
Build flashcard viewer and Anki .apkg export.

FRONTEND (src/components/Flashcards/FlashcardViewer.tsx):
- Card-flip animation (CSS 3D transform) on click
- Shows front on default, back on flip
- Navigation: Previous / Next buttons + keyboard arrows
- Card counter (e.g., "Card 5 of 18")
- Shuffle button
- Three-pile sorting (study mode):
  - "Know it" (green) — moves to known pile
  - "Almost" (yellow) — moves to review pile  
  - "No clue" (red) — moves to unknown pile
  - At end, show stats: X known, Y almost, Z unknown
  - Option to review only "almost" and "no clue" cards
- Tags shown as small pills below the card
- Clean, centered card with generous padding and good typography

FRONTEND (src/components/Flashcards/AnkiExport.tsx):
- "Export to Anki" button
- Creates a .apkg file (Anki package format)
- Opens save dialog for file location
- Shows success message with import instructions

BACKEND (src-tauri/src/utils/anki_export.rs):
The .apkg format is a ZIP file containing:
  - collection.anki2 (SQLite database)
  - media file (empty JSON: {})

Implement .apkg generation:
- Create a SQLite database in memory with Anki schema:
  Tables: col, notes, cards, revlog, graves
- col table: single row with models JSON (Basic model), 
  decks JSON (deck named "LectureToLearn::{lecture_title}"), 
  and other required Anki metadata
- For each flashcard, insert into notes table:
  - id: timestamp-based unique id
  - mid: model id from col
  - flds: front + \x1f + back (field separator)
  - tags: space-separated tag string
  - And create corresponding card in cards table
- Package as ZIP with .apkg extension
- Use the `zip` crate for ZIP creation

Tauri command `export_anki(lecture_id: String, output_path: String)`:
  - Reads flashcards from database
  - Calls anki export function
  - Saves .apkg to output_path
  - Returns success/error

Tauri command `get_lecture_flashcards(lecture_id: String)`:
  - Returns flashcards from database

This is complex — research the exact Anki schema carefully.
A simpler alternative if .apkg is too complex: export as 
tab-separated .txt file that Anki can import (front\tback\ttags).
Implement BOTH options and let user choose.
```

**Acceptance Criteria:**
- [ ] Card flip animation works smoothly
- [ ] Study mode with three-pile sorting works
- [ ] Can navigate cards with keyboard and buttons
- [ ] Anki .apkg export imports correctly into Anki (or .txt fallback works)
- [ ] Tags display on cards
- [ ] Shuffle randomizes card order

---

## PHASE 5: Lecture Library + History

**Goal: Multi-lecture management, history, search across past lectures.**

### Task 5.1 — Lecture Library Dashboard

```
PROMPT FOR AGENT:
─────────────────
Build the lecture library — the app's home/landing page.

Replace the current Upload page as the default landing view.

FRONTEND — new component: src/components/Library/
  
LectureLibrary.tsx (the new home page):
- Header: "Your Lectures" + "New Lecture" button (goes to Upload)
- Search bar: searches across lecture titles, transcript text, 
  and notes content
- Filter/sort options:
  - Sort: newest first, oldest first, alphabetical
  - Filter: by status (complete, processing, error)
- Lecture grid (cards):
  - Each card shows: title (from notes, or filename), date, 
    duration, status badge, tiny progress if still processing
  - Click card → goes to that lecture's Notes view
  - Three-dot menu on card: Delete, Re-process, Export All
  - "Delete" shows confirmation dialog, removes all data + audio file

EmptyState.tsx:
- Shown when no lectures exist
- Illustration (simple SVG) + "Upload your first lecture" CTA

BACKEND:
- Tauri command `list_lectures()` → Vec<LectureSummary>
  Returns id, title, filename, duration, status, created_at for all lectures
- Tauri command `search_lectures(query: String)` → Vec<LectureSummary>
  Full-text search across transcripts and notes (use SQLite FTS5)
- Tauri command `delete_lecture(lecture_id: String)`:
  Deletes all related records + audio file from disk
- Tauri command `export_all_lecture_data(lecture_id, output_dir)`:
  Exports transcript.md + notes.md + quiz.json + flashcards.txt + 
  mindmap.svg as a folder

DATABASE updates:
- Add FTS5 virtual table for full-text search across transcripts and notes
- Update schema migrations

ROUTING update:
- "/" → LectureLibrary (new home)
- "/upload" → AudioUploader
- "/lecture/:id/transcript" → TranscriptViewer  
- "/lecture/:id/notes" → StructuredNotes
- "/lecture/:id/quiz" → QuizPlayer
- "/lecture/:id/research" → PaperList
- "/lecture/:id/mindmap" → MindMapCanvas
- "/lecture/:id/flashcards" → FlashcardViewer
- "/settings" → SettingsPanel

Update Sidebar:
- When no lecture selected: show Library + Upload + Settings
- When a lecture is selected: show all 7 content views for that 
  lecture + "Back to Library" link at top
- Show lecture title in sidebar header when viewing a lecture
```

**Acceptance Criteria:**
- [ ] Library shows all past lectures as cards
- [ ] Search finds lectures by transcript/notes content
- [ ] Delete removes all lecture data
- [ ] Navigation flows correctly between library and lecture views
- [ ] Sidebar updates contextually
- [ ] Empty state shows when no lectures exist

---

## PHASE 6: Polish + UX Excellence

**Goal: Error handling, keyboard shortcuts, loading states, and visual polish.**

### Task 6.1 — Error Handling + Resilience

```
PROMPT FOR AGENT:
─────────────────
Add comprehensive error handling and edge case resilience.

BACKEND — Error handling audit:
- Every Tauri command should return Result<T, String> with 
  descriptive error messages
- Add retry logic to LLM calls (max 2 retries with 3s delay)
- Handle Ollama not running → specific error message with 
  "Start Ollama" instructions
- Handle model not pulled → show `ollama pull {model}` command
- Handle corrupt audio files → clear error on upload
- Handle disk full → check available space before saving
- Handle whisper model not downloaded → prompt to download first
- Add timeout to all LLM calls (5 min default, configurable)
- Handle very short transcripts (< 100 words) → warn user that 
  results may be limited
- Handle empty/silent audio → detect and warn

FRONTEND — Error UX:
- Global error boundary component (React Error Boundary)
- Toast notification system (build a simple one with Tailwind, 
  no external library):
  - Success (green), Warning (yellow), Error (red), Info (blue)
  - Auto-dismiss after 5 seconds, click to dismiss
  - Stack up to 3 toasts
- Each content view should handle:
  - Loading state (skeleton loaders, not just spinners)
  - Empty state (when data hasn't been generated yet)
  - Error state (when generation failed, with "Retry" button)
- Pipeline ProgressTracker: if a stage fails, show error inline 
  with option to "Skip" or "Retry" that stage
- Network error for Semantic Scholar: specific message about 
  requiring internet for research papers only

FRONTEND — Loading skeletons:
- Create skeleton components for: NotesSkeleton, QuizSkeleton, 
  FlashcardSkeleton, MindMapSkeleton, PaperSkeleton
- Pulse animation (Tailwind animate-pulse)
- Match the approximate layout of the real component
```

**Acceptance Criteria:**
- [ ] App never shows a raw error to users
- [ ] Toast notifications work for all success/error cases
- [ ] Each view handles loading/empty/error states gracefully
- [ ] Ollama connection errors show helpful guidance
- [ ] Failed pipeline stages can be retried individually
- [ ] Skeleton loaders appear during data loading

---

### Task 6.2 — Keyboard Shortcuts + Accessibility

```
PROMPT FOR AGENT:
─────────────────
Add keyboard shortcuts and basic accessibility.

KEYBOARD SHORTCUTS (global, using a useHotkeys hook):
- Ctrl+N → New lecture (go to Upload)
- Ctrl+1 through Ctrl+7 → Navigate to each lecture view
- Ctrl+, → Settings
- Ctrl+H → Home (Library)
- Escape → Close modals/dialogs, stop recording
- Space → Play/pause audio (when not in text input)
- Left/Right arrows → Previous/next flashcard (in flashcard view)
- Left/Right arrows → Previous/next quiz question (in quiz view)
- Ctrl+Shift+E → Export current view data
- ? → Show keyboard shortcuts modal

Create a KeyboardShortcutsModal component that lists all shortcuts
in a nicely formatted grid. Trigger with "?" key.

ACCESSIBILITY:
- All interactive elements have focus outlines (ring-2 ring-blue-500)
- Proper aria-labels on buttons with only icons
- Role attributes on custom components (role="tablist" on sidebar, etc.)
- Focus management: when navigating views, focus moves to main content
- All images/SVGs have alt text
- Color is not the only indicator (e.g., quiz correct/incorrect 
  also has ✓/✗ icons, not just green/red)
- Reduced motion: respect prefers-reduced-motion media query,
  disable card flip animation and use opacity fade instead
```

**Acceptance Criteria:**
- [ ] All keyboard shortcuts work correctly
- [ ] Shortcuts modal displays on "?" key
- [ ] Tab navigation works through all interactive elements
- [ ] Focus visible on all interactive elements
- [ ] Screen reader announces view changes
- [ ] Reduced motion preference respected

---

### Task 6.3 — Visual Polish Pass

```
PROMPT FOR AGENT:
─────────────────
Final visual polish across the entire app.

GLOBAL STYLES:
- Consistent spacing scale (Tailwind's default, but audit for 
  consistency — all section padding should be p-6, card padding p-4)
- Consistent border radius (rounded-lg for cards, rounded-md for buttons)
- Consistent shadows (shadow-sm for cards, shadow-md for modals)
- Inter font family (add via Google Fonts or bundle locally)
- Smooth transitions on all interactive elements (transition-all duration-200)

SIDEBAR:
- Width: 256px fixed
- Collapsible to icon-only mode (64px) with toggle button
- Active nav item: blue-600 bg, white text
- Hover: slate-700 bg
- Lecture title truncated with ellipsis if too long
- Small lecture count badge next to "Library"

UPLOAD PAGE:
- Drop zone: dashed border animation on drag-over
- Upload progress: linear progress bar inside the drop zone
- Recording: pulsing red dot next to the timer

CONTENT VIEWS:
- All views have a consistent header: 
  View title (h1) + action buttons (right-aligned) + divider
- Content max-width 900px, centered for readability (except mind map)
- Smooth fade-in animation when content loads (opacity 0→1, translateY 10px→0)

DARK/LIGHT THEME:
- Add a theme toggle in the header (sun/moon icon)
- Implement using Tailwind's dark: prefix
- Save preference to settings
- Default: dark

WINDOW:
- Custom title bar (Tauri allows this) — match app theme
- App icon (simple graduation cap or book icon, create as SVG)
```

**Acceptance Criteria:**
- [ ] Visual consistency across all views
- [ ] Sidebar collapse/expand works
- [ ] Dark/light theme toggle works
- [ ] Smooth animations throughout
- [ ] Custom title bar matches theme
- [ ] Typography is clean and readable

---

## PHASE 7: Advanced Features

**Goal: Power-user features that differentiate the app.**

### Task 7.1 — "Explain This" Feature

```
PROMPT FOR AGENT:
─────────────────
Add a contextual "Explain This" feature across the app.

In any text view (Transcript, Notes), allow users to:
1. Select any text
2. Right-click or click a floating button → "Explain This"
3. A slide-in panel appears on the right with an LLM-generated 
   explanation of the selected text

IMPLEMENTATION:

FRONTEND — new component: ExplainPanel.tsx
- Slide-in panel from the right (350px wide)
- Shows: selected text (quoted), explanation below
- Streaming text display as LLM generates
- "Explain simpler" button → re-explains at one level below 
  current personalization
- "Explain deeper" button → re-explains at one level above
- History of explanations in the panel (scrollable)
- Close button

FRONTEND — TextSelectionToolbar.tsx:
- Floating toolbar that appears when user selects text
- Position it just above the selection
- Buttons: "Explain", "Add to Flashcards", "Copy"
- "Add to Flashcards" creates a new flashcard with selected text 
  as front, asks LLM for the back, adds to lecture's flashcard set

BACKEND:
- Tauri command `explain_text(text: String, context: String, level: String)`:
  context = surrounding paragraph for better explanation
  Streams response back via events
- Tauri command `add_custom_flashcard(lecture_id, front, back)`:
  Adds a flashcard to the lecture's set

Use the personalization level from settings for the explanation.
```

**Acceptance Criteria:**
- [ ] Text selection shows floating toolbar
- [ ] "Explain" opens side panel with streaming explanation
- [ ] "Explain simpler/deeper" adjusts explanation level
- [ ] "Add to Flashcards" creates a new card from selected text
- [ ] Panel can be closed and reopened

---

### Task 7.2 — Lecture Comparison + Batch Processing

```
PROMPT FOR AGENT:
─────────────────
Add ability to compare lectures and batch process multiple files.

BATCH UPLOAD:
- On Upload page, allow selecting multiple files at once
- Show a queue of files to process
- Process them sequentially (one pipeline at a time)
- Show queue status: waiting → processing → complete
- "Process All" button starts the queue
- Can remove items from queue before processing

LECTURE COMPARISON:
FRONTEND — new route /compare:
- Select 2-3 lectures from a dropdown/search
- Side-by-side view showing:
  - Summary comparison
  - Overlapping key terms (highlighted)
  - Combined mind map (merge the trees)
  - Combined flashcard deck option

BACKEND:
- Tauri command `compare_lectures(lecture_ids: Vec<String>)`:
  - Sends both summaries to LLM with prompt:
    "Compare these lecture summaries. Identify: 
    1. Common themes, 2. Unique topics in each, 
    3. Contradictions or different perspectives, 
    4. Suggested study order"
  - Returns comparison analysis

- Tauri command `merge_flashcards(lecture_ids: Vec<String>)`:
  - Combines flashcards, removes near-duplicates (basic string similarity)
  - Returns merged set
```

**Acceptance Criteria:**
- [ ] Can upload and queue multiple lectures
- [ ] Queue processes sequentially with status updates
- [ ] Can compare 2 lectures side-by-side
- [ ] Comparison analysis highlights commonalities and differences
- [ ] Can merge flashcard decks

---

## PHASE 8: Performance + Distribution

**Goal: Optimize for real-world use and prepare for distribution.**

### Task 8.1 — Performance Optimization

```
PROMPT FOR AGENT:
─────────────────
Optimize app performance for real-world lecture lengths (1-2 hours).

TRANSCRIPTION OPTIMIZATION:
- Add progress reporting per audio segment (not just overall %)
- For files > 30 minutes, process in 5-minute chunks with 
  10-second overlap for continuity
- Show estimated time remaining based on processing speed

LLM OPTIMIZATION:
- For very long transcripts (> 10,000 words):
  - Chunk into sections by topic (use silence gaps or keyword shifts)
  - Generate notes/quiz per section, then merge
  - Show per-section progress
- Cache LLM responses by transcript hash — if transcript unchanged 
  and user regenerates, ask "Use cached result or regenerate?"
- Add token count estimation display before processing
  ("This will process ~8,000 tokens, estimated 3-5 minutes")

GENERAL:
- Lazy-load content views (React.lazy + Suspense)
- Virtualized lists for large flashcard sets (react-window)
- Debounce search in Library
- Database query optimization — add indexes on commonly queried columns
- Audio file cleanup option in Settings ("Delete audio after processing" 
  to save disk space)
- Show disk space usage in Settings

Memory management:
- Ensure large audio files don't load fully into memory
- Stream audio file to whisper in chunks
- Clear LLM response buffers after parsing
```

**Acceptance Criteria:**
- [ ] 1-hour lecture processes without crashes or freezing
- [ ] Memory usage stays under 2GB during processing
- [ ] Chunked processing shows granular progress
- [ ] Response caching prevents redundant LLM calls
- [ ] Disk space usage visible in Settings

---

### Task 8.2 — Video Upload + Audio Extraction

```
PROMPT FOR AGENT:
─────────────────
Add support for uploading video files and processing them through the same
audio-first pipeline used for lectures.

FRONTEND:
- Update Upload flow to accept video file types:
  - .mp4, .mov, .mkv, .webm, .avi, .m4v
- Show explicit processing stages in queue for video sources:
  - "uploading" -> "extracting audio" -> "transcribing" -> "processing"
- Display source type badge (Audio / Video) in queue + Library item details.
- Reuse existing queue + Process All behavior.

BACKEND:
- Extend file intake command(s) to accept video paths.
- If file is video:
  - Use ffmpeg to extract audio to app data lectures directory.
  - Normalize to supported pipeline format (16kHz mono WAV preferred).
  - Preserve lecture duration metadata from extracted audio.
- Persist extracted audio path as the lecture's canonical audio source.
- Return user-friendly errors if extraction fails (codec unsupported, ffmpeg missing, etc.).

PIPELINE INTEGRATION:
- Once extraction finishes, run normal transcript + LLM pipeline unchanged.
- Keep all downstream features (notes/quiz/mindmap/flashcards/export) identical.
- Add cleanup handling for temporary extraction artifacts.

UX + RELIABILITY:
- Show conversion failure message with actionable next step.
- Ensure large video uploads do not freeze UI thread.
- Keep behavior consistent in batch mode with mixed audio/video files.
```

**Acceptance Criteria:**
- [ ] User can upload common video formats from Upload page
- [ ] Video is converted to audio successfully before transcription
- [ ] Converted audio enters existing transcription + pipeline flow
- [ ] Queue supports mixed audio/video items with correct statuses
- [ ] Clear errors shown when ffmpeg/conversion fails

---

### Task 8.3 — YouTube URL Import + Audio Download

```
PROMPT FOR AGENT:
─────────────────
Add a "YouTube Import" workflow that downloads lecture audio from a YouTube URL
using yt-dlp + ffmpeg, then runs the standard Cognote processing pipeline.

FRONTEND:
- Add "Import from YouTube" section on Upload page:
  - URL input field
  - Validate URL format before submit
  - "Add to Queue" button
- Show progress states:
  - "validating URL" -> "downloading" -> "extracting audio" -> "transcribing" -> "processing"
- Allow URL imports to coexist with file uploads in the same queue.

BACKEND:
- Add Tauri command `import_youtube_audio(url: String)`:
  - Run `yt-dlp` to fetch best audio stream for the URL
  - Use ffmpeg post-processing to extract/normalize audio
  - Save result in app data lectures directory
  - Create lecture DB record and return metadata
- Emit progress events for download/extraction where possible.
- Detect and handle:
  - yt-dlp not installed
  - ffmpeg not installed
  - invalid/unreachable/private video
  - blocked/age-restricted content

PIPELINE INTEGRATION:
- Imported YouTube lectures should behave exactly like uploaded lectures:
  - transcript editing
  - notes, quiz, flashcards, mind map
  - exports and lecture library management

SECURITY + SAFETY:
- Sanitize filenames from video titles.
- Store only required metadata + downloaded audio locally.
- Reject non-YouTube URLs (or unsupported domains) with clear error.
```

**Acceptance Criteria:**
- [ ] User can paste valid YouTube URL and add it to queue
- [ ] Audio downloads via yt-dlp and extracts via ffmpeg successfully
- [ ] Downloaded item completes normal transcription + LLM pipeline
- [ ] Progress and error states are visible and understandable
- [ ] Missing-tool scenarios (yt-dlp/ffmpeg) are handled gracefully

---

### Task 8.4 — Build + Distribution

```
PROMPT FOR AGENT:
─────────────────
Configure build and distribution for Windows, macOS, and Linux.

TAURI BUILD CONFIG (tauri.conf.json):
- App name: "Cognote"
- Identifier: "com.cognote.app"
- Version from package.json
- Configure bundling:
  - Windows: .msi installer + .exe
  - macOS: .dmg
  - Linux: .deb + .AppImage
- Include whisper model downloader (don't bundle models — too large)
- Set minimum window size: 800x600
- File associations: register for .mp3, .wav, .m4a (optional open-with)

FIRST-RUN EXPERIENCE:
- On first launch, show a setup wizard:
  1. Welcome screen with app description
  2. "Install Ollama" step — detect if installed, link to download
  3. "Pull a model" — suggest ollama pull llama3.1:8b, show command
  4. "Download Whisper model" — download base model (with progress)
  5. "Set your level" — personalization picker
  6. "Ready!" — go to Library

AUTO-UPDATE (optional):
- Use Tauri's built-in updater if hosting releases on GitHub
- Check for updates on launch, non-intrusive notification

README.md:
- Clear description of what the app does
- Screenshots placeholder sections  
- Prerequisites: Ollama installed + a model pulled
- Build instructions
- Tech stack description
- License (MIT)

Create a CONTRIBUTING.md with development setup instructions.
```

**Acceptance Criteria:**
- [ ] App builds successfully for at least one platform
- [ ] First-run wizard guides through Ollama + Whisper setup
- [ ] Installer works on target platform
- [ ] README is comprehensive

---


## PHASE 9: Custom Theming System

**Goal: Let users load custom themes and allow devs to ship new built-in themes with releases. Builds on the existing CSS custom-property design system with zero component changes.**

### Architecture Overview

The entire UI already uses ~50 CSS variables (backgrounds, text, borders, accents, shadows, inputs, sidebar, etc.) defined in `:root` (light) and `html.dark` (dark). A "theme" is simply a JSON object mapping these variable names to values. Adding themes means:

1. **Built-in themes** — JSON files bundled in the app defining variable overrides.
2. **User themes** — JSON files in the app data directory that users create, import, or download.
3. **Theme engine** — Applies a JSON theme by injecting CSS variables onto `<html>` via a `<style>` tag or `element.style.setProperty()`.

No component code changes required — every component already uses `var(--token)`.

```
Theme resolution order:
  1. Active theme CSS variables (user or built-in)
  2. Falls back to "dark" or "light" base palette
```

```
Theme file schema (JSON):
{
  "id": "monokai-dark",
  "name": "Monokai Dark",
  "author": "Cognote Team",
  "version": "1.0.0",
  "base": "dark",                    // "dark" | "light" — determines Tailwind dark: prefix
  "variables": {
    "--bg-base": "#272822",
    "--bg-surface": "#2d2e27",
    "--bg-surface-raised": "#383930",
    "--text-primary": "#f8f8f2",
    "--accent-primary": "#a6e22e",
    "--accent-primary-hover": "#b8f34a",
    "--accent-secondary": "#fd971f",
    "--color-success": "#a6e22e",
    "--color-error": "#f92672",
    "--sidebar-bg": "#1e1f1c",
    // ... any subset of the ~50 CSS variables
    // missing variables inherit from the base ("dark" or "light") palette
  },
  "fonts": {                         // optional
    "--font-heading": "'JetBrains Mono', monospace",
    "--font-body": "'JetBrains Mono', monospace"
  }
}
```

### File Locations

```
src-tauri/
  resources/
    themes/                           # Built-in themes shipped with the app
      monokai-dark.json
      solarized-light.json
      nord.json
      dracula.json
      catppuccin-mocha.json
      github-light.json
      rose-pine.json

<app_data_dir>/
  themes/                             # User themes directory
    my-custom-theme.json
    downloaded-theme.json
  settings.json                       # theme field changes from "dark"/"light" to theme id

src/
  lib/
    themeEngine.ts                    # Theme loading, applying, validation
    themes.ts                        # Built-in theme metadata + registry
  components/
    Settings/
      ThemePicker.tsx                 # Theme browser + preview UI
      ThemeEditor.tsx                 # Simple theme editor (color pickers)
      ThemeImportExport.tsx           # Import/export theme JSON files
```

---

### Task 9.1 — Theme Engine + Built-in Themes

```
PROMPT FOR AGENT:
─────────────────
Build the theme engine and bundle 5+ built-in themes.

THEME ENGINE (src/lib/themeEngine.ts):

Create a ThemeEngine module with these functions:

1. `applyTheme(theme: ThemeDefinition)`:
   - Sets the `data-theme` attribute on `<html>` to the theme id
   - Toggles `.dark` / `.light` class based on theme.base
   - Iterates theme.variables and calls
     `document.documentElement.style.setProperty(key, value)`
     for each CSS variable
   - If theme.fonts exists, applies font overrides
   - Stores active theme id in localStorage for instant boot

2. `resetTheme()`:
   - Removes all inline CSS properties from <html>
   - Reverts to default dark/light based on settings

3. `validateTheme(json: unknown): ThemeDefinition | ThemeValidationError`:
   - Validates the JSON against the theme schema
   - Checks required fields: id, name, base, variables
   - Validates variable names start with "--"
   - Validates color values (hex, rgb, rgba, hsl, oklch)
   - Returns typed ThemeDefinition or validation errors

4. `mergeWithBase(theme: ThemeDefinition): Record<string, string>`:
   - Takes a theme's partial variables and merges with the full
     base palette (dark or light) so all ~50 variables are defined
   - This ensures themes with only a few overrides still work

5. `generatePreviewColors(theme: ThemeDefinition)`:
   - Returns a small set of key colors for thumbnail previews:
     { bg, surface, text, accent, secondary }

TYPES (src/lib/types.ts — add):
  ThemeDefinition {
    id: string;
    name: string;
    author: string;
    version: string;
    base: "dark" | "light";
    variables: Record<string, string>;
    fonts?: Record<string, string>;
    builtIn?: boolean;
  }

  ThemeValidationError {
    field: string;
    message: string;
  }

BUILT-IN THEMES (src/lib/themes.ts):
Create at minimum these 7 themes as TypeScript constants:

1. "cognote-dark" (current dark — extract from index.css)
2. "cognote-light" (current light — extract from index.css)
3. "nord" — Nord color palette, dark base
4. "dracula" — Dracula theme colors, dark base
5. "solarized-light" — Solarized light palette
6. "catppuccin-mocha" — Catppuccin Mocha, dark base
7. "rose-pine" — Rosé Pine palette, dark base

For each theme: define the full set of ~50 CSS variables
matching the existing token names from index.css. Use the
official color palettes from each theme's documentation.

SETTINGS UPDATES:

Backend (settings.rs):
- Change the `theme` field semantics: it now stores a theme ID
  string (e.g., "cognote-dark", "nord", "my-custom-theme")
  instead of just "dark"/"light"
- Add `custom_theme_ids: Vec<String>` field to track user themes
- Default theme remains "cognote-dark"

Frontend (types.ts):
- Change ThemeMode to: type ThemeMode = string
  (any theme ID, not just "dark" | "light")
- Add ThemeDefinition and related types

Frontend (settingsStore.ts):
- Add `activeThemeId: string` to store
- Add `availableThemes: ThemeDefinition[]` (built-in + user)
- Add `loadThemes()` action
- Add `setActiveTheme(themeId: string)` action

APP STARTUP (App.tsx / main.tsx):
- On boot, read theme id from localStorage (for instant apply)
- Load settings → apply the saved theme via themeEngine
- If theme id not found, fall back to "cognote-dark"

CSS CHANGES (index.css):
- Keep the existing :root and html.dark blocks as the DEFAULT
  fallback. The theme engine overrides via inline styles which
  have higher specificity.
- No changes needed to component CSS or utility classes.
```

**Acceptance Criteria:**
- [ ] All 7 built-in themes apply correctly with no visual glitches
- [ ] Theme switch is instant (no flash or delay)
- [ ] Theme persists across app restarts
- [ ] Missing variables in a theme fall back to base palette
- [ ] All components render correctly in every built-in theme

---

### Task 9.2 — Theme Picker UI

```
PROMPT FOR AGENT:
─────────────────
Build the theme selection UI in Settings.

FRONTEND (src/components/Settings/ThemePicker.tsx):

Theme browser panel within the Settings page:

1. THEME GRID:
   - Grid of theme preview cards (3 columns)
   - Each card shows:
     - Theme name + author
     - 5-color swatch strip (bg, surface, text, accent, secondary)
     - A mini preview: tiny rectangle showing a mock sidebar +
       content area using the theme's colors (purely CSS, ~80x50px)
     - "Active" badge on the current theme
     - Click to apply immediately (live preview)
   - Group by: "Built-in" and "Custom" sections

2. LIVE PREVIEW:
   - When hovering a theme card, temporarily apply it to the app
   - On mouse leave, revert to the active theme
   - This gives instant visual feedback without committing
   - Use themeEngine.applyTheme() on hover, resetTheme() on leave

3. ACTIVE INDICATOR:
   - Checkmark badge on the currently active theme card
   - "Applied" text below the active card

4. SEARCH/FILTER:
   - Search by theme name
   - Filter: All / Dark base / Light base

SETTINGS PANEL INTEGRATION:
- Replace the current simple dark/light toggle with the
  ThemePicker component
- Keep it in a dedicated "Appearance" section of Settings
- Move any existing theme toggle references to use the new picker

KEYBOARD:
- Arrow keys navigate the theme grid
- Enter applies the selected theme
- Escape reverts to previous theme (if previewing)
```

**Acceptance Criteria:**
- [ ] Theme grid shows all built-in themes with color previews
- [ ] Hovering a theme previews it live on the whole app
- [ ] Clicking a theme applies and persists it
- [ ] Search and filter work correctly
- [ ] Active theme is clearly indicated

---

### Task 9.3 — Custom Theme Import/Export + Editor

```
PROMPT FOR AGENT:
─────────────────
Allow users to import, export, and create custom themes.

FRONTEND (src/components/Settings/ThemeImportExport.tsx):

IMPORT:
- "Import Theme" button in the Custom themes section
- Opens a file dialog (Tauri dialog plugin) filtered to .json files
- Validates the JSON using themeEngine.validateTheme()
- On validation errors: show a detailed error message listing
  which fields are missing or invalid
- On success: copies theme JSON to app_data_dir/themes/
- Theme appears immediately in the picker grid
- If a theme with the same id already exists, prompt:
  "Replace existing?" / "Import as copy"

EXPORT:
- Three-dot menu on each custom theme card → "Export"
- Opens save dialog, writes the theme JSON file
- Also allow "Export" on built-in themes so users can use
  them as starting points for customization

SHARE:
- "Copy theme JSON" button → copies to clipboard
- Can paste theme JSON into an import dialog (textarea input)
  as alternative to file import

FRONTEND (src/components/Settings/ThemeEditor.tsx):

A simple in-app theme editor:

1. START FROM:
   - "Create from scratch" (starts with current theme as base)
   - "Duplicate [theme name]" (copies an existing theme)

2. METADATA:
   - Theme name (text input, required)
   - Author (text input, defaults to "Custom")
   - Base mode: Dark / Light (radio, required — determines
     CSS dark/light class and fallback palette)

3. COLOR EDITOR:
   - Organized by category (same as CSS file sections):
     § Backgrounds (bg-base, bg-surface, bg-surface-raised, bg-muted, bg-subtle, bg-inset)
     § Text (text-primary, text-secondary, text-tertiary, text-muted)
     § Borders (border-default, border-subtle, border-strong)
     § Accent (accent-primary, accent-primary-hover, accent-secondary)
     § Semantic (success, warning, error, info — each with main/subtle/text)
     § Sidebar (sidebar-bg, sidebar-border, sidebar-item-hover, sidebar-item-active-bg/text)
     § Inputs (input-bg, input-border)
   - Each variable: label + color picker (native <input type="color">)
     + hex text input for precise values
   - LIVE PREVIEW: every color change applies immediately
     so the user sees the app update in real-time

4. FONT OVERRIDE (optional section):
   - Font name input for heading and body
   - Preview text sample with selected fonts

5. ACTIONS:
   - "Save Theme" → validates and saves to app_data_dir/themes/
   - "Cancel" → reverts all preview changes
   - "Reset to Base" → clears all overrides

BACKEND:

Tauri commands:
- `list_custom_themes()` → Vec<ThemeDefinition>
  Reads all .json files from app_data_dir/themes/, parses, returns
- `save_custom_theme(theme_json: String)` → Result<String, String>
  Validates and writes to app_data_dir/themes/{id}.json
  Creates the themes/ directory if it doesn't exist
- `delete_custom_theme(theme_id: String)` → Result<(), String>
  Deletes the JSON file. Refuses to delete built-in themes.
  If deleted theme was active, reverts to "cognote-dark"
- `import_theme_file(source_path: String)` → Result<ThemeDefinition, String>
  Reads file, validates, copies to themes directory
- `export_theme_file(theme_id: String, destination_path: String)` → Result<(), String>
  Writes theme JSON to the chosen path

PERMISSIONS (capabilities/default.json):
- Ensure dialog:allow-open and dialog:allow-save are in capabilities
  for file picker dialogs
```

**Acceptance Criteria:**
- [ ] Can import a .json theme file and it appears in picker
- [ ] Validation catches malformed theme files with clear errors
- [ ] Can create a new theme with live color editing
- [ ] Color changes preview in real-time across the whole app
- [ ] Can export themes as .json for sharing
- [ ] Can delete custom themes (not built-in ones)
- [ ] Duplicate detection works (same theme id)

---

### Task 9.4 — Developer Theme Pipeline (for shipping new themes in releases)

```
PROMPT FOR AGENT:
─────────────────
Create a developer workflow for adding new themes to Cognote releases.

THEME AUTHORING WORKFLOW:

1. Create a new JSON file in src-tauri/resources/themes/{name}.json
   using the ThemeDefinition schema
2. Register it in src/lib/themes.ts by adding it to the BUILT_IN_THEMES array
3. Build the app — the theme ships as a bundled resource

BUNDLED RESOURCE SETUP (tauri.conf.json):
- Add to bundle.resources: ["resources/themes/*.json"]
- These files are included in the app binary and accessible
  at runtime via the Tauri resource path API

THEME REGISTRY (src/lib/themes.ts):
- BUILT_IN_THEMES: ThemeDefinition[] — all hardcoded built-in themes
- loadBundledThemes(): reads from Tauri resource directory at runtime
  to discover any additional bundled .json theme files
- This dual approach means:
  a) Core themes are in code (always available, no I/O needed)
  b) Extra themes can be dropped into resources/ without code changes

AUTO-DISCOVERY:
- On app start, scan BOTH:
  1. Built-in themes (from themes.ts constants)
  2. Bundled resource themes (from resources/themes/*.json via Tauri)
  3. User themes (from app_data_dir/themes/*.json)
- Merge and deduplicate by theme id
- Built-in themes cannot be overridden by user themes with same id

THEME DEVELOPMENT HELPER:
- Add a script: scripts/validate-themes.ts
  - Reads all .json files from src-tauri/resources/themes/
  - Validates each against the schema
  - Reports errors with file + field details
  - Run as: `bun run scripts/validate-themes.ts`
- Add to package.json: "validate-themes": "bun scripts/validate-themes.ts"

DOCUMENTATION:
- Add a THEMES.md file in the project root explaining:
  - Theme JSON schema with all ~50 variable names
  - How to create a theme (step-by-step)
  - Color palette guidelines (contrast ratios for accessibility)
  - How to submit a theme for inclusion in the app
  - Example minimal theme (just accent colors)
  - Example full theme (all variables)

ACCESSIBILITY CHECK:
- In the theme validation script, add WCAG AA contrast checking:
  - text-primary on bg-base must have >= 4.5:1 ratio
  - text-secondary on bg-surface must have >= 3:1 ratio
  - accent-primary on bg-surface must have >= 3:1 ratio
  - Warn (don't block) if contrast is insufficient
```

**Acceptance Criteria:**
- [ ] Devs can add a .json file and it ships with the next build
- [ ] Bundled themes auto-discovered on app start
- [ ] Validation script catches schema errors
- [ ] WCAG contrast warnings help ensure accessible themes
- [ ] THEMES.md documents the full workflow
- [ ] Adding a theme requires zero component code changes

---

## Dependency Summary

```toml
# Cargo.toml key dependencies
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rusqlite = { version = "0.31", features = ["bundled"] }
whisper-rs = "0.11"
reqwest = { version = "0.12", features = ["json"] }
uuid = { version = "1", features = ["v4"] }
tokio = { version = "1", features = ["full"] }
hound = "3"           # WAV reading/writing
symphonia = "0.5"     # Audio metadata
thiserror = "1"
zip = "0.6"           # Anki .apkg creation
chrono = "0.4"
```

```json
// package.json key dependencies
{
  "react": "^18",
  "react-dom": "^18",
  "react-router-dom": "^6",
  "zustand": "^4",
  "reactflow": "^11",
  "dagre": "^0.8",
  "@tauri-apps/api": "^2",
  "tailwindcss": "^3",
  "typescript": "^5"
}
```

---

