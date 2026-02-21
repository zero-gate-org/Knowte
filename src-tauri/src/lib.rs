mod audio_stream;
mod commands;
mod db;
mod models;
pub mod pipeline;
mod utils;

use tauri::Manager;

use audio_stream::AudioServerPort;
use commands::audio::{
    accept_audio_file, pick_audio_file, pick_audio_files, start_recording, stop_recording,
    RecordingState,
};
use commands::compare::{compare_lectures, merge_flashcards};
use commands::explain::{add_custom_flashcard, explain_text};
use commands::library::{delete_lecture, export_all_lecture_data, list_lectures, search_lectures};
use commands::llm::{check_llm_availability, generate_llm_response};
use commands::pipeline::{
    estimate_pipeline_work, export_flashcards_anki, export_flashcards_tsv, export_notes_markdown,
    get_flashcards, get_mindmap, get_notes, get_pipeline_status, get_quiz, regenerate_mindmap,
    regenerate_notes, regenerate_quiz, save_quiz_attempt, start_pipeline,
};
use commands::research::{get_lecture_papers, search_related_papers};
use commands::settings::{check_ollama_status, get_settings, get_storage_usage, save_settings};
use commands::transcribe::{
    check_whisper_models, download_whisper_model, get_lecture_audio_url, get_lecture_transcript,
    transcribe_audio, update_transcript_segment,
};
use db::init_database;

#[tauri::command]
fn get_audio_server_port(state: tauri::State<'_, AudioServerPort>) -> u16 {
    state.0
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let database = init_database(&app.handle()).map_err(|error| error.to_string())?;
            app.manage(database);

            // Start the local HTTP server for audio streaming and store the port.
            let port = audio_stream::start_audio_server(&app.handle());
            app.manage(AudioServerPort(port));

            Ok(())
        })
        .manage(RecordingState::default())
        .invoke_handler(tauri::generate_handler![
            get_audio_server_port,
            check_ollama_status,
            get_settings,
            save_settings,
            get_storage_usage,
            pick_audio_file,
            pick_audio_files,
            accept_audio_file,
            start_recording,
            stop_recording,
            download_whisper_model,
            check_whisper_models,
            transcribe_audio,
            update_transcript_segment,
            get_lecture_audio_url,
            get_lecture_transcript,
            generate_llm_response,
            check_llm_availability,
            explain_text,
            add_custom_flashcard,
            start_pipeline,
            estimate_pipeline_work,
            get_pipeline_status,
            get_notes,
            get_quiz,
            get_flashcards,
            get_mindmap,
            search_related_papers,
            get_lecture_papers,
            regenerate_notes,
            export_notes_markdown,
            regenerate_quiz,
            save_quiz_attempt,
            regenerate_mindmap,
            export_flashcards_anki,
            export_flashcards_tsv,
            list_lectures,
            search_lectures,
            delete_lecture,
            export_all_lecture_data,
            compare_lectures,
            merge_flashcards,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
