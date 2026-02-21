# AGENTS.md - AI Agent Instructions

This document provides guidance for AI coding agents working on the Cognote (LectureToLearn) codebase.

## Project Overview

Cognote is a desktop application that transforms lecture audio into structured learning materials using AI. It's built with Tauri v2 (Rust backend + React frontend) and uses Ollama for local LLM processing.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Tauri v2 |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| State Management | Zustand |
| Routing | React Router DOM v7 |
| Bundler | Vite 7 |
| Backend | Rust |
| Local LLM | Ollama (llama3.1/mistral/phi-3) |
| Transcription | whisper.cpp (planned) |
| Database | SQLite (planned) |

## Commands

```bash
# Development
bun run dev          # Start Vite dev server (frontend only)
bun run tauri dev    # Start full Tauri app with hot reload

# Build
bun run build        # Build frontend (TypeScript + Vite)
bun run tauri build  # Build production app for current platform

# Type checking
npx tsc --noEmit     # Run TypeScript type check

# Linting (Rust backend)
cd src-tauri && cargo clippy

# Testing (Rust backend)
cd src-tauri && cargo test
```

## Project Structure

```
cognote/
├── src/                          # Frontend React code
│   ├── App.tsx                   # Main app component with routing
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # Global styles + Tailwind
│   ├── components/
│   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   ├── Settings/             # Settings-related components
│   │   ├── Upload/               # Audio upload (planned)
│   │   ├── Transcript/           # Transcript viewer (planned)
│   │   ├── Notes/                # Notes display (planned)
│   │   ├── Quiz/                 # Quiz player (planned)
│   │   ├── Research/             # Paper search (planned)
│   │   ├── MindMap/              # Mind map viz (planned)
│   │   ├── Flashcards/           # Flashcard viewer (planned)
│   │   └── Pipeline/             # Progress tracking (planned)
│   ├── pages/                    # Route page components
│   ├── stores/                   # Zustand stores
│   │   └── settingsStore.ts      # Settings state
│   ├── lib/
│   │   ├── tauriApi.ts           # Typed Tauri invoke wrappers
│   │   ├── types.ts              # TypeScript interfaces
│   │   └── constants.ts          # App constants
│   ├── hooks/                    # Custom React hooks
│   └── utils/                    # Utility functions
│
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── main.rs               # Tauri entry point
│   │   ├── lib.rs                # Library exports
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   └── settings.rs       # Settings commands
│   │   ├── db/                   # SQLite (planned)
│   │   ├── models/               # Data structs (planned)
│   │   ├── pipeline/             # Processing pipeline (planned)
│   │   └── utils/                # Utilities (planned)
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
│
├── plan.md                       # Detailed development plan
├── CHANGELOG.md                  # Task completion log
└── AGENTS.md                     # This file
```

## Code Conventions

### Frontend (TypeScript/React)

1. **Component Structure**
   - Use functional components with hooks
   - Export components from index.ts files in each folder
   - Keep components focused and single-responsibility

2. **Styling**
   - Use Tailwind CSS classes directly
   - Dark theme is default: `bg-slate-900 text-slate-100`
   - No CSS modules or styled-components

3. **State Management**
   - Use Zustand for global state
   - Keep state minimal and normalized
   - Stores go in `src/stores/`

4. **Tauri Commands**
   - Wrap all Tauri `invoke()` calls in `src/lib/tauriApi.ts`
   - Provide proper TypeScript types for all commands
   - Handle errors gracefully with user-friendly messages

5. **Imports**
   - Use barrel exports (index.ts files)
   - Import order: external → internal → types

### Backend (Rust)

1. **Command Structure**
   - All Tauri commands go in `src-tauri/src/commands/`
   - Use `#[tauri::command]` attribute
   - Return `Result<T, String>` for error handling
   - Mark async commands with `async` in the macro

2. **Error Handling**
   - Use `thiserror` crate for custom error types
   - Convert errors to user-friendly strings
   - Never expose internal error details to users

3. **Settings Pattern**
   - Settings stored as JSON in app data directory
   - Use `app.path().app_data_dir()` for path resolution
   - Create default settings on first run

4. **Code Organization**
   - One module per file
   - Re-export from mod.rs
   - Keep modules focused on single responsibility

## Development Workflow

### Adding a New Tauri Command

1. Create command function in `src-tauri/src/commands/`
2. Add to `mod.rs` exports
3. Register in `src-tauri/src/lib.rs` invoke_handler
4. Add typed wrapper in `src/lib/tauriApi.ts`
5. Add types to `src/lib/types.ts` if needed
6. Update relevant Zustand store

### Adding a New Page/Route

1. Create component in `src/pages/`
2. Export from `src/pages/index.ts`
3. Add Route in `src/App.tsx`
4. Add nav item in `src/components/Sidebar.tsx`

## Architecture Decisions

1. **Local-First**: All data stored locally in SQLite. Only external API call is Semantic Scholar (optional).

2. **Privacy**: Audio and transcripts never leave the user's machine. LLM runs via local Ollama.

3. **Offline Capable**: Core features work without internet. Research paper search requires connection.

4. **Modular Pipeline**: Processing stages (transcribe → summarize → notes → quiz → flashcards → mindmap) are independent and can be rerun individually.

## Current Progress

| Task | Status |
|------|--------|
| 1.1 Tauri + React Scaffold | ✅ Complete |
| 1.2 Settings + Ollama Health Check | ✅ Complete |
| 1.3 Audio Upload + Mic Recording | 🔲 Pending |
| 2.1 Whisper Integration | ✅ Complete |
| 2.2 Transcript Editing | ✅ Complete |
| 3.1 Prompt Templates + Ollama Client | ✅ Complete |
| 3.2 Pipeline Orchestrator | ✅ Complete |
| 3.3 Semantic Scholar Integration | ✅ Complete |
| 4.1 Structured Notes View | ✅ Complete |
| 4.2 Interactive Quiz | ✅ Complete |
| 4.x Output Views (remaining) | 🔲 Pending |
| 5.x Lecture Library | 🔲 Pending |
| 6.x Polish | 🔲 Pending |
| 7.x Advanced Features | 🔲 Pending |
| 8.x Distribution | 🔲 Pending |

See `plan.md` for detailed task specifications and `CHANGELOG.md` for completed work.

## Important Notes

- Run `bun run tauri dev` to test the full application
- Ensure Ollama is running for settings page functionality
- The app uses bun as package manager (not npm/yarn)
- TypeScript strict mode is enabled - avoid `any` types
- Test both light and dark themes when adding UI components

## Changelog Documentation

After completing each task, document the changes in `CHANGELOG.md` using this format:

```markdown
## [Task X.Y] - YYYY-MM-DD
- Added: feature description
- Added: another feature (if applicable)
- Fixed: bug description (if applicable)
- Files modified:
  - path/to/file1.tsx
  - path/to/file2.rs
```

- Use the task number from `plan.md` (e.g., Task 1.1, Task 1.2)
- List all features/changes as bullet points with `Added`, `Fixed`, `Changed`, or `Removed` prefixes
- Include all files that were created or modified
- Keep entries concise but informative
