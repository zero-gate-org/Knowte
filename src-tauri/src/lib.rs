mod commands;
mod models;
mod utils;

use commands::audio::{
    accept_audio_file, pick_audio_file, start_recording, stop_recording, RecordingState,
};
use commands::settings::{check_ollama_status, get_settings, save_settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(RecordingState::default())
        .invoke_handler(tauri::generate_handler![
            check_ollama_status,
            get_settings,
            save_settings,
            pick_audio_file,
            accept_audio_file,
            start_recording,
            stop_recording
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
