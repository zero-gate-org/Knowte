mod commands;
mod db;
mod models;
mod utils;

use tauri::Manager;

use commands::audio::{
    accept_audio_file, pick_audio_file, start_recording, stop_recording, RecordingState,
};
use commands::settings::{check_ollama_status, get_settings, save_settings};
use commands::llm::{check_llm_availability, generate_llm_response};
use commands::transcribe::{
    check_whisper_models, download_whisper_model, get_lecture_audio_url, transcribe_audio,
    update_transcript_segment,
};
use db::init_database;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let database = init_database(&app.handle()).map_err(|error| error.to_string())?;
            app.manage(database);
            Ok(())
        })
        .manage(RecordingState::default())
        .invoke_handler(tauri::generate_handler![
            check_ollama_status,
            get_settings,
            save_settings,
            pick_audio_file,
            accept_audio_file,
            start_recording,
            stop_recording,
            download_whisper_model,
            check_whisper_models,
            transcribe_audio,
            update_transcript_segment,
            get_lecture_audio_url,
            generate_llm_response,
            check_llm_availability
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
