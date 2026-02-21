# Contributing to Cognote

Thank you for your interest in contributing! This guide covers setting up a development environment, code conventions, and the process for submitting changes.

---

## Development Environment Setup

### 1. System Requirements

| Requirement | Notes |
|-------------|-------|
| **Rust** (stable) | Install via [rustup](https://rustup.rs): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **Bun** ≥ 1.0 | Install via [bun.sh](https://bun.sh): `curl -fsSL https://bun.sh/install \| bash` |
| **Tauri v2 system deps** | Platform-specific — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) |
| **Ollama** | [ollama.ai](https://ollama.ai) — needed for LLM features at runtime |
| **Git** | Standard version control |

### 2. Clone and Install

```bash
git clone https://github.com/your-username/cognote.git
cd cognote
bun install
```

### 3. Bundled Binaries for Development

Cognote bundles `ffmpeg` and `yt-dlp` for audio/video processing. These are included in `src-tauri/resources/` for each platform:

```
src-tauri/resources/
  ffmpeg/
    linux/    ← ffmpeg binary for Linux
    macos/    ← ffmpeg binary for macOS
    windows/  ← ffmpeg.exe for Windows
  yt-dlp/
    linux/    ← yt-dlp binary for Linux
    macos/    ← yt-dlp binary for macOS
    windows/  ← yt-dlp.exe for Windows
```

If these are missing from your checkout, download them manually:

- **ffmpeg**: [ffmpeg.org/download.html](https://ffmpeg.org/download.html) — place the static binary at the appropriate path above
- **yt-dlp**: [github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases) — place the binary at the appropriate path above

### 4. Whisper Models

Whisper models are **not** committed to the repository (they are too large). Download a model via the app's Settings page, or manually place a `.bin` file in `src-tauri/whisper-models/`.

### 5. Run in Development Mode

```bash
bun run tauri dev
```

This starts the Vite dev server (on `http://localhost:1420`) and the Tauri desktop window simultaneously with hot module reload for the frontend.

### 6. Frontend Only (no Tauri window)

```bash
bun run dev
```

Opens the frontend in a browser at `http://localhost:1420`. Most UI work can be done here, but Tauri commands (`invoke`) will fail/no-op without the Rust backend.

---

## Project Structure

```
cognote/
├── src/                          # React frontend (TypeScript)
│   ├── App.tsx                   # Root component, routing, layout
│   ├── components/               # Reusable UI components (grouped by feature)
│   │   ├── Setup/                # First-run setup wizard
│   │   ├── Settings/             # Settings panel and sub-components
│   │   ├── Library/              # Lecture library dashboard
│   │   ├── Upload/               # Audio/video upload + recording
│   │   ├── Transcript/           # Transcript viewer + editor + audio player
│   │   ├── Notes/                # Structured notes display + export
│   │   ├── Quiz/                 # Interactive quiz player
│   │   ├── Flashcards/           # Flashcard viewer + Anki export
│   │   ├── MindMap/              # React Flow mind map
│   │   ├── Research/             # Semantic Scholar paper list
│   │   ├── Pipeline/             # Processing pipeline progress tracker
│   │   ├── Explain/              # "Explain This" text selection panel
│   │   ├── Toast/                # Toast notification system
│   │   └── ...                   # Layout, ErrorBoundary, Skeletons, etc.
│   ├── pages/                    # Route-level page wrappers
│   ├── stores/                   # Zustand state stores
│   │   ├── lectureStore.ts       # Lecture list and current lecture state
│   │   ├── settingsStore.ts      # App settings (persisted via Tauri)
│   │   ├── toastStore.ts         # Toast notification queue
│   │   └── uiStore.ts            # Sidebar collapse, transient UI state
│   ├── lib/
│   │   ├── tauriApi.ts           # Typed wrappers for all Tauri invoke() calls
│   │   ├── types.ts              # Shared TypeScript interfaces and constants
│   │   ├── constants.ts          # App-wide constants
│   │   └── hotkeys.ts            # Keyboard shortcut definitions
│   └── hooks/
│       ├── useHotkeys.ts         # Global hotkey handler
│       └── index.ts
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri builder, plugin setup, command registration
│   │   ├── main.rs               # Binary entry point
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── settings.rs       # get_settings, save_settings, check_ollama_status
│   │   │   ├── audio.rs          # accept_audio_file, start_recording, stop_recording
│   │   │   ├── transcribe.rs     # transcribe_audio, download_whisper_model
│   │   │   ├── llm.rs            # generate_llm_response (streaming via Ollama)
│   │   │   ├── pipeline.rs       # start_pipeline, get_pipeline_status, get_notes, etc.
│   │   │   ├── library.rs        # list_lectures, delete_lecture, search_lectures
│   │   │   ├── research.rs       # search_related_papers, get_lecture_papers
│   │   │   ├── explain.rs        # explain_text, add_custom_flashcard
│   │   │   └── compare.rs        # compare_lectures, merge_flashcards
│   │   ├── db/                   # SQLite schema, migrations, queries
│   │   ├── models/               # Rust data structs (serde Serialize/Deserialize)
│   │   ├── pipeline/             # Processing pipeline orchestrator
│   │   └── utils/                # Prompt templates, Anki export, ffmpeg helpers
│   ├── capabilities/
│   │   └── default.json          # Tauri v2 permission capabilities
│   ├── resources/                # Bundled binaries (ffmpeg, yt-dlp)
│   ├── whisper-models/           # Downloaded Whisper model files (gitignored)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── AGENTS.md                     # AI agent instructions and task status
├── CHANGELOG.md                  # Task completion log
├── plan.md                       # Detailed development plan with all tasks
└── README.md
```

---

## Code Conventions

### Frontend (TypeScript / React)

- **Functional components** with hooks only — no class components
- **CSS variables for all colors and spacing** — use `var(--token)` via inline `style={{}}`  
  Do not add new hardcoded colors; use the design system tokens from `src/index.css`
- **Tailwind for layout only** — flex, grid, gap, padding, rounded, etc.
- **No external UI libraries** for new components — use the existing utility classes (`.card`, `.btn-primary`, `.input`, etc.)
- **Zustand stores** for cross-component state; local `useState` for component-level state
- **Barrel exports** — every `components/Foo/` directory must have an `index.ts` re-exporting its public API
- **Import order**: external packages → internal modules → types
- **No `any` types** — TypeScript strict mode is enabled

#### Adding a new Tauri command

1. Implement the Rust function in `src-tauri/src/commands/<file>.rs` with `#[tauri::command]`
2. Export it from `commands/mod.rs`
3. Register it in `src-tauri/src/lib.rs` inside `tauri::generate_handler![...]`
4. Add a typed wrapper function in `src/lib/tauriApi.ts`
5. Add any new types to `src/lib/types.ts`

#### Adding a new page

1. Create `src/pages/MyPage.tsx`
2. Export it in `src/pages/index.ts`
3. Add the `<Route>` in `src/App.tsx`
4. Add a nav entry in `src/components/Sidebar.tsx` if needed

### Backend (Rust)

- All Tauri commands return `Result<T, String>` — never panic
- Use owned types (`String`, `Vec<T>`) in async commands, never `&str`
- Long-running operations (transcription, LLM calls, downloads) must run in a background `tokio::spawn` and emit events via `app.emit(...)` for progress
- Error messages should be user-friendly — describe the problem and the fix
- `thiserror` for custom error types; convert to `String` at the command boundary

---

## Useful Commands

```bash
# Frontend
bun run dev              # Start Vite dev server only
npx tsc --noEmit         # TypeScript type check

# Full app
bun run tauri dev        # Start full app with hot reload
bun run tauri build      # Production build

# Rust backend
cd src-tauri
cargo clippy             # Lint Rust code
cargo test               # Run Rust unit tests
cargo check              # Fast compile check without linking
```

---

## Testing

### Frontend

There is currently no automated frontend test suite. When adding new logic, prefer extracting it into pure utility functions in `src/utils/` or `src/lib/` that can be unit-tested independently.

### Rust

Unit tests live alongside source files in `#[cfg(test)]` modules. Run them with:

```bash
cd src-tauri && cargo test
```

---

## Submitting Changes

1. **Fork** the repository and create a feature branch from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Keep commits focused** — one logical change per commit with a clear message:
   ```
   feat: add keyboard shortcut for exporting current view
   fix: prevent double-save when skipping setup wizard
   ```

3. **Type-check before opening a PR**:
   ```bash
   npx tsc --noEmit && cd src-tauri && cargo clippy
   ```

4. **Update CHANGELOG.md** following the existing format — include the task number from `plan.md`, a bullet list of changes, and modified files.

5. **Open a pull request** describing what was changed and why.

---

## Commit Message Format

```
<type>: <short description>

[optional longer explanation]
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`

Examples:
```
feat: add YouTube URL import to upload queue
fix: clamp whisper model download progress to 0-100
docs: update README build instructions
chore: bump @xyflow/react to 12.10.1
```

---

## Reporting Issues

Please open a GitHub Issue with:

- Cognote version / build date
- Operating system and version
- Ollama version and model name
- Steps to reproduce
- Expected vs. actual behaviour
- Relevant logs (open the dev console with `Ctrl+Shift+I` / `Cmd+Option+I`)
