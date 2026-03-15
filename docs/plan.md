# Knowte — AI Agent Development Plan

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
knowte/
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
  "author": "Knowte Team",
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

1. "knowte-dark" (current dark — extract from index.css)
2. "knowte-light" (current light — extract from index.css)
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
  string (e.g., "knowte-dark", "nord", "my-custom-theme")
  instead of just "dark"/"light"
- Add `custom_theme_ids: Vec<String>` field to track user themes
- Default theme remains "knowte-dark"

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
- If theme id not found, fall back to "knowte-dark"

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
  If deleted theme was active, reverts to "knowte-dark"
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
Create a developer workflow for adding new themes to Knowte releases.

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

## PHASE 10: Future Feature Ideas

**Goal: Extended capabilities for power users and advanced learning workflows.**

---

### Task 10.1 — Speaker Diarization

```
PROMPT FOR AGENT:
─────────────────
Implement speaker diarization to identify different speakers in multi-person lectures.

BACKEND (src-tauri/src/commands/diarize.rs):
- Integrate a speaker diarization model (e.g., pyannote.audio or resemblyzer)
- Tauri command `diarize_audio(lecture_id: String)` that:
  - Processes the audio file with speaker embedding extraction
  - Returns speaker segments: [{ speaker_id, start, end }]
  - Assigns labels like "Speaker A", "Speaker B" or identifies speaker changes
- Save speaker segments to database alongside transcript

FRONTEND (src/components/Transcript/):
- Update TranscriptViewer to display speaker labels per segment
- Color-code different speakers in the transcript view
- Allow user to rename speakers (e.g., "Prof. Smith", "Student 1")

DATABASE:
- Add speakers table: (id, lecture_id, label, color)
- Update transcripts table to link to speaker segments

Acceptance Criteria:
- [ ] Multi-speaker audio identifies distinct speakers
- [ ] Speaker labels display in transcript view
- [ ] Users can rename speaker labels
- [ ] Speaker info persists in database
```

---

### Task 10.2 — Real-time Live Transcription

```
PROMPT FOR AGENT:
─────────────────
Add real-time transcription display during live lecture recording.

BACKEND (src-tauri/src/commands/realtime_transcribe.rs):
- Modify recording to use chunked audio buffer
- Stream audio chunks to Whisper for incremental transcription
- Emit real-time transcript events: app.emit("realtime-transcript", { text, is_final })
- Tauri command `start_realtime_transcription(recording_id: String)`
- Tauri command `stop_realtime_transcription()`

FRONTEND (src/components/Upload/LiveRecorder.tsx):
- Add "Live Transcript" panel that shows transcript in real-time
- Display partial results with subtle styling
- Show final segments with confirmed styling
- Auto-scroll as new transcript appears
- Toggle between waveform and live transcript views

Acceptance Criteria:
- [ ] Transcript appears within 2-3 seconds of speech
- [ ] Partial (in-progress) text shown differently from final
- [ ] Recording continues smoothly with transcription running
- [ ] Final transcript matches full post-processing
```

---

### Task 10.3 — Audio Enhancement Pipeline

```
PROMPT FOR AGENT:
─────────────────
Build audio preprocessing pipeline to improve transcription quality.

BACKEND (src-tauri/src/commands/audio_enhance.rs):
- Tauri command `enhance_audio(lecture_id: String, options: EnhanceOptions)`:
  - Noise reduction using noise-profil e or RNNoise
  - Audio normalization/leveling
  - Bandpass filtering (300Hz - 3400Hz for voice)
  - Optional: remove silence, reduce reverb
- Process audio before Whisper transcription
- Return enhanced audio path for transcription

FRONTEND (src/components/Upload/):
- Add "Enhance Audio" toggle in upload/processing options
- Show before/after waveform comparison
- Allow user to enable/disable specific enhancement options

Acceptance Criteria:
- [ ] Noisy audio produces cleaner transcription
- [ ] Audio levels normalized across long recordings
- [ ] User can enable/disable enhancements
- [ ] Original audio preserved, enhanced is separate file
```

---

### Task 10.4 — Batch Lecture Processing

```
PROMPT FOR AGENT:
─────────────────
Implement queue system for processing multiple lectures sequentially.

BACKEND (src-tauri/src/commands/batch.rs):
- Tauri command `queue_lecture(lecture_ids: String[])`:
  - Add lectures to processing queue
  - Return queue position and estimated time
- Tauri command `get_queue_status()`:
  - Return queue state: [{ lecture_id, status, progress }]
- Tauri command `pause_queue()` / `resume_queue()`
- Process queue in background with configurable concurrency

FRONTEND (src/components/Pipeline/):
- Add "Batch Process" button in Library view
- Multi-select lectures for batch processing
- Queue management UI: reorder, pause, cancel
- Desktop notification when batch completes
- Progress shown in system tray

Acceptance Criteria:
- [ ] Can queue 10+ lectures for overnight processing
- [ ] Queue status visible in UI
- [ ] Can pause/resume/cancel queue items
- [ ] Notifications on completion
```

---

### Task 10.5 — Global Search

```
PROMPT FOR AGENT:
─────────────────
Build full-text search across all lectures, transcripts, notes, and quizzes.

BACKEND (src-tauri/src/commands/search.rs):
- Integrate SQLite FTS5 for full-text search
- Index: transcripts, notes (JSON), quiz questions, flashcards
- Tauri command `search(query: String, filters: SearchFilters)`:
  - Returns: [{ type, lecture_id, title, snippet, score }]
- Tauri command `rebuild_search_index()` for manual rebuild

FRONTEND (src/components/):
- Global search modal (Cmd/Ctrl+K to open)
- Search input with instant results
- Filter by: type (transcript/notes/quiz/flashcards), date, topic
- Click result navigates to relevant view
- Highlight matching text in results

Acceptance Criteria:
- [ ] Search finds content across all lecture data
- [ ] Results appear within 200ms
- [ ] Filters narrow results correctly
- [ ] Click navigates to correct location
```

---

### Task 10.6 — Additional Export Formats

```
PROMPT FOR AGENT:
─────────────────
Add PDF, DOCX, and PPTX export options.

BACKEND (src-tauri/src/commands/export.rs):
- Add export formats: PDF, DOCX, HTML, CSV
- Tauri command `export_lecture(lecture_id: String, format: ExportFormat)`:
  - PDF: Use printpdf or html-to-pdf crate
  - DOCX: Use docx-rs crate  
  - CSV: For flashcard/quiz data
- Return exported file path

FRONTEND (src/components/Notes/NotesExport.tsx):
- Add format dropdown: Markdown (current), PDF, DOCX, HTML
- Add export options per format:
  - PDF: Include/exclude images, page size
  - DOCX: Template selection
- Progress indicator for large exports
- Open exported file or reveal in folder

Acceptance Criteria:
- [ ] PDF export renders notes correctly
- [ ] DOCX opens in Word with formatting intact
- [ ] HTML export works as standalone file
- [ ] Flashcards export to CSV for spreadsheet use
```

---

### Task 10.7 — Third-party Note-taking Integration

```
PROMPT FOR AGENT:
─────────────────
Add export/sync to Notion, Obsidian, and other platforms.

BACKEND (src-tauri/src/commands/integrations.rs):
- Tauri command `export_to_notion(lecture_id: String, api_key: String)`:
  - Create Notion page with transcript, notes as blocks
  - Use Notion API client
- Tauri command `export_to_obsidian(vault_path: String)`:
  - Create markdown files in Obsidian vault format
  - Frontmatter with metadata
- Tauri command `export_to_evernote(lecture_id: String)`

FRONTEND (src/components/Settings/):
- Add "Integrations" section in Settings
- Configure API keys (Notion, Evernote)
- Set default export path for Obsidian
- Test connection button for each service
- Per-lecture export to any connected service

DATABASE:
- Store integration credentials (encrypted)
- Track sync status per lecture

Acceptance Criteria:
- [ ] Export to Notion creates proper page structure
- [ ] Obsidian export creates valid vault with frontmatter
- [ ] Credentials stored securely
- [ ] Re-sync updates existing notes
```

---

### Task 10.8 — Presentation Mode

```
PROMPT FOR AGENT:
─────────────────
Build full-screen presentation mode for notes and mind maps.

FRONTEND (src/components/Presentation/):
- PresentationMode.tsx:
  - Full-screen overlay with black background
  - Notes rendered as slide-like sections
  - Mind map with zoom/pan controls
- Navigation: Arrow keys, spacebar, click
- Timer overlay for study sessions
- Spotlight mode (highlight current section, dim rest)
- Export presentation as PDF slides

TYPES (src/lib/types.ts):
  PresentationSettings {
    showTimer: boolean;
    timerDuration: number;
    spotlightMode: boolean;
    autoAdvance: boolean;
  }

Acceptance Criteria:
- [ ] Enter presentation mode from notes/mindmap
- [ ] Arrow keys navigate between sections
- [ ] Timer displays and counts down
- [ ] Spotlight mode highlights current content
- [ ] ESC exits presentation mode
```

---

### Task 10.9 — Voice Commands

```
PROMPT FOR AGENT:
─────────────────
Implement voice command recognition for hands-free operation.

BACKEND (src-tauri/src/commands/voice.rs):
- Integrate Vosk or Whisper for command recognition
- Tauri command `start_voice_commands()`:
  - Listen for wake word "Hey Knowte" or custom
  - Recognize commands: start recording, stop, next slide, etc.
- Emit voice command events to frontend
- Configurable command vocabulary

FRONTEND (src/components/Settings/):
- VoiceSettings.tsx:
  - Enable/disable voice commands
  - Custom wake word configuration
  - Command vocabulary display
  - Microphone selection

FRONTEND (src/hooks/):
- useVoiceCommands.ts:
  - Listen for voice command events
  - Execute corresponding actions
  - Visual indicator when listening

Acceptance Criteria:
- [ ] Wake word activates voice listening
- [ ] Basic commands recognized: start/stop, next, previous
- [ ] Voice status indicator in UI
- [ ] Works with external microphones
- [ ] Can disable via settings
```

---

### Task 10.10 — Lecture Chapter Generation

```
PROMPT FOR AGENT:
─────────────────
Automatically detect topic changes and generate chapter markers.

BACKEND (src-tauri/src/commands/chapters.rs):
- Use LLM to analyze transcript for topic transitions
- Tauri command `generate_chapters(lecture_id: String)`:
  - Analyze transcript segments
  - Identify natural breaks/topics
  - Return: [{ title, start_time, end_time, summary }]
- Save chapters to database

FRONTEND (src/components/Transcript/):
- Update TranscriptViewer with chapter sidebar
- Chapter markers in timeline view
- Click chapter to jump to timestamp
- Edit chapter titles manually
- Drag to reorder chapters

DATABASE:
- Add chapters table: (id, lecture_id, title, start_time, end_time, summary)

Acceptance Criteria:
- [ ] Auto-generates 3-8 chapters per lecture
- [ ] Chapters display in sidebar timeline
- [ ] Click navigates to correct time
- [ ] User can edit chapter titles
- [ ] Chapters persist across sessions
```

---

### Task 10.11 — Key Moment Bookmarking

```
PROMPT FOR AGENT:
─────────────────
Add timestamp-based bookmarking with annotations.

BACKEND (src-tauri/src/commands/bookmarks.rs):
- Tauri command `add_bookmark(lecture_id: String, time: f64, note: String)`
- Tauri command `get_bookmarks(lecture_id: String)`
- Tauri command `update_bookmark(bookmark_id, note: String)`
- Tauri command `delete_bookmark(bookmark_id)`

FRONTEND (src/components/Transcript/):
- Add bookmark button in audio player
- Click timestamp to add quick bookmark
- Bookmark panel showing all bookmarks for lecture
- Add notes to bookmarks
- Export bookmarks as markdown

DATABASE:
- Add bookmarks table: (id, lecture_id, timestamp, note, created_at)

Acceptance Criteria:
- [ ] Add bookmark at current playback time
- [ ] Bookmarks display in list panel
- [ ] Click bookmark jumps to timestamp
- [ ] Can add/edit notes on bookmarks
- [ ] Bookmarks exportable
```

---

### Task 10.12 — Spaced Repetition Analytics

```
PROMPT FOR AGENT:
─────────────────
Implement spaced repetition scheduling and learning analytics.

BACKEND (src-tauri/src/commands/spaced_repetition.rs):
- Implement SM-2 or similar algorithm
- Tauri command `record_quiz_result(flashcard_id, quality: number)`:
  - Update next review date based on performance
- Tauri command `get_due_reviews()`:
  - Return flashcards due for review today
- Tauri command `get_learning_stats(lecture_id)`:
  - Return: { total_reviewed, accuracy, streak_days, next_review }

FRONTEND (src/components/Flashcards/):
- Add review mode with SM-2 buttons: Again, Hard, Good, Easy
- Show next review date per card
- Add "Review Due" badge in sidebar
- Learning dashboard with:
  - Review streak calendar
  - Accuracy over time chart
  - Time spent studying

DATABASE:
- Update flashcards table: (next_review, interval, ease_factor)
- Add review_history table

Acceptance Criteria:
- [ ] SM-2 algorithm schedules reviews correctly
- [ ] Due cards highlighted in UI
- [ ] Learning stats dashboard displays
- [ ] Review history persists
- [ ] Mobile companion can sync reviews
```

---

### Task 10.13 — AI Study Companion

```
PROMPT FOR AGENT:
─────────────────
Build AI-powered study planning and recommendations.

BACKEND (src-tauri/src/commands/study_companion.rs):
- Analyze quiz performance to identify weak areas
- Tauri command `get_study_recommendations(lecture_ids: String[])`:
  - Return prioritized topics to review
  - Suggested study time per topic
- Tauri command `generate_study_plan(lecture_ids, days: number)`:
  - Create day-by-day study schedule
  - Balance across topics based on performance
- Tauri command `get_progress_report(lecture_ids)`:
  - Comprehensive learning report

FRONTEND (src/pages/):
- StudyCompanion.tsx:
  - Dashboard with progress overview
  - Weak areas highlighted
  - Study plan calendar view
  - Daily/weekly goals

Acceptance Criteria:
- [ ] Identifies topics needing review from quiz data
- [ ] Generates multi-day study plan
- [ ] Shows progress over time
- [ ] Recommendations update after quiz attempts
- [ ] Exportable study plan
```

---

### Task 10.14 — Lecture Comparison Tool

```
PROMPT FOR AGENT:
─────────────────
Build side-by-side comparison view for two lectures.

FRONTEND (src/pages/):
- Compare.tsx:
  - Select two lectures from dropdowns
  - Side-by-side transcript view
  - Synchronized scrolling option
  - Highlight matching content
  - Show differences/similarities

BACKEND (src-tauri/src/commands/compare.rs):
- Tauri command `compare_lectures(lecture_id_1, lecture_id_2)`:
  - Use embeddings to find similar content
  - Return: [{ topic, overlap_score, lecture1_snippet, lecture2_snippet }]

Acceptance Criteria:
- [ ] Can select any two lectures
- [ ] Transcripts display side-by-side
- [ ] Similar content highlighted
- [ ] Can filter by topics
- [ ] Export comparison report
```

---

### Task 10.15 — Mobile Companion App

```
PROMPT FOR AGENT:
─────────────────
Build companion mobile app for iOS/Android with sync.

This is a larger undertaking - outline the architecture:

MOBILE APP (separate project in /mobile/):
- Framework: React Native with Expo
- Features:
  - View flashcards and quizzes
  - Sync progress from desktop
  - Record audio on mobile (syncs to desktop)
  - Push notifications for review reminders
- Authentication: Local encryption key shared via QR code
- Sync: Local-first, sync when online

BACKEND (src-tauri/src/commands/sync.rs):
- Tauri command `generate_sync_qr()`: Returns sync credentials
- Tauri command `sync_with_mobile(device_id)`: Bidirectional sync
- Conflict resolution: Last-write-wins with merge for flashcards

DATABASE:
- Add device table for mobile device registration
- Add sync_log for audit trail

Acceptance Criteria:
- [ ] Mobile app can view desktop flashcards
- [ ] Quiz progress syncs
- [ ] Mobile recordings appear in desktop library
- [ ] QR code pairing works
- [ ] Offline-first with background sync
```

---

### Task 10.16 — Plugin/Extension System

```
PROMPT FOR AGENT:
─────────────────
Build plugin system for third-party extensions.

PLUGIN API (src/lib/pluginApi.ts):
- Define plugin interface:
  ```
  interface KnowtePlugin {
    id: string;
    name: string;
    version: string;
    onTranscript?: (transcript) => Promise<PluginResult>;
    onNotes?: (notes) => Promise<PluginResult>;
    onExport?: (format, data) => Promise<PluginResult>;
    settings?: PluginSettings;
  }
  ```

BACKEND (src-tauri/src/commands/plugins.rs):
- Tauri command `load_plugins()`: Load from plugins/ directory
- Tauri command `install_plugin(plugin_zip_path)`
- Tauri command `unload_plugin(plugin_id)`
- Sandboxed execution for plugins

FRONTEND (src/components/Settings/):
- PluginManager.tsx:
  - List installed plugins
  - Enable/disable plugins
  - Plugin settings panel
  - Install from file

Acceptance Criteria:
- [ ] Plugins load from directory
- [ ] Plugin UI appears in settings
- [ ] Can enable/disable plugins
- [ ] Plugin hooks execute at right times
- [ ] Plugins are sandboxed
```

---

### Task 10.17 — Multi-language UI (i18n)

```
PROMPT FOR AGENT:
─────────────────
Add internationalization support for the UI.

FRONTEND:
- Integrate react-i18next
- Create translation files: /src/locales/{lang}/translation.json
- Languages to support initially:
  - English (en) - default
  - Spanish (es)
  - French (fr)
  - German (de)
  - Chinese Simplified (zh)
  - Japanese (ja)
- Add language selector in Settings
- Persist language preference

STRUCTURE:
```
src/locales/
├── en/translation.json
├── es/translation.json
├── fr/translation.json
├── de/translation.json
├── zh/translation.json
└── ja/translation.json
```

COMPONENT UPDATES:
- Replace all hardcoded strings with t() function
- Format dates/numbers with locale
- RTL support ready (for future Arabic/Hebrew)

Acceptance Criteria:
- [ ] Language selector in Settings
- [ ] All UI text translatable
- [ ] 6 languages available
- [ ] Language persists across sessions
- [ ] Dates format per locale
```

---

### Task 10.18 — Optional Cloud Backup

```
PROMPT FOR AGENT:
─────────────────
Add optional end-to-end encrypted cloud backup.

BACKEND (src-tauri/src/commands/backup.rs):
- Tauri command `configure_backup(provider, credentials)`:
  - Support S3-compatible storage (AWS, Backblaze, MinIO)
  - Credentials stored encrypted locally
- Tauri command `create_backup()`:
  - Export database + media to encrypted zip
  - Upload to configured provider
- Tauri command `restore_backup(backup_id)`:
  - Download and decrypt backup
  - Merge with local data
- Tauri command `list_backups()`
- Encryption: AES-256-GCM with user-provided key

FRONTEND (src/components/Settings/):
- BackupSettings.tsx:
  - Configure S3-compatible endpoint
  - Enter encryption key (shown once)
  - Manual backup button
  - Auto-backup schedule (daily/weekly)
  - Restore from backup UI
  - Backup history list

Acceptance Criteria:
- [ ] Can configure S3-compatible storage
- [ ] Backups are encrypted before upload
- [ ] Can restore from any backup point
- [ ] Auto-backup works on schedule
- [ ] Encryption key never leaves device
```

---

## Current Progress

| Task | Status |
|------|--------|
| 1.1 Tauri + React Scaffold | ✅ Complete |
| 1.2 Settings + Ollama Health Check | ✅ Complete |
| 1.3 Audio Upload + Mic Recording | ✅ Complete |
| 2.1 Whisper Integration | ✅ Complete |
| 2.2 Transcript Editing | ✅ Complete |
| 3.1 Prompt Templates + Ollama Client | ✅ Complete |
| 3.2 Pipeline Orchestrator | ✅ Complete |
| 3.3 Semantic Scholar Integration | ✅ Complete |
| 4.1 Structured Notes View | ✅ Complete |
| 4.2 Interactive Quiz | ✅ Complete |
| 4.3 Mind Map Visualization | ✅ Complete |
| 4.4 Flashcards + Anki Export | ✅ Complete |
| 5.x Lecture Library | ✅  Complete |
| 6.x Polish | ✅  Complete |
| 7.x Advanced Features | ✅  Complete |
| 8.x Distribution | ✅  Complete |
| 9.x Custom Theming System | 🔲 In Progress |
| 10.x Future Feature Ideas | 🔲 Planned |

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

