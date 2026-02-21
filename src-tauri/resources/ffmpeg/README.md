# Bundled ffmpeg

Place platform-specific ffmpeg binaries in these paths before creating release bundles:

- `src-tauri/resources/ffmpeg/linux/ffmpeg`
- `src-tauri/resources/ffmpeg/macos/ffmpeg`
- `src-tauri/resources/ffmpeg/windows/ffmpeg.exe`

Runtime resolution order in Cognote:

1. Installed ffmpeg in app data: `<app_data>/tools/ffmpeg/`
2. Bundled ffmpeg in the app's `resources/ffmpeg/<platform>/` directory
3. `ffmpeg` from system `PATH`

On startup, Cognote installs ffmpeg into `<app_data>/tools/ffmpeg/` before opening the UI.

This keeps packaged apps self-contained while preserving local development fallback.
