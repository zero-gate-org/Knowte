use crate::commands::settings::get_settings;
use crate::db::queries::{
    get_lecture_by_id, get_transcript_by_id, get_transcript_by_lecture_id, update_lecture_status,
    update_transcript_content, upsert_transcript, TranscriptRecord,
};
use crate::db::AppDatabase;
use crate::utils::ffmpeg::resolve_ffmpeg_path;
use chrono::Utc;
use futures_util::StreamExt;
use hound::{SampleFormat, WavReader, WavSpec, WavWriter};
use rubato::{FftFixedInOut, Resampler};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::Instant;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tauri::{AppHandle, Emitter, Manager, State};
use thiserror::Error;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const TARGET_SAMPLE_RATE: u32 = 16_000;
const WHISPER_MODEL_REPOSITORY: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";
const SILENCE_AVERAGE_THRESHOLD: f32 = 0.0005;
const SILENCE_PEAK_THRESHOLD: f32 = 0.01;
const LONG_AUDIO_THRESHOLD_SECONDS: f64 = 30.0 * 60.0;
const TRANSCRIPTION_CHUNK_SECONDS: f64 = 5.0 * 60.0;
const TRANSCRIPTION_OVERLAP_SECONDS: f64 = 10.0;

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgressEvent {
    pub percent: u8,
    pub model_size: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionProgressEvent {
    pub lecture_id: String,
    pub percent: u8,
    pub chunk_index: Option<u32>,
    pub chunk_total: Option<u32>,
    pub chunk_percent: Option<u8>,
    pub eta_seconds: Option<u64>,
    pub realtime_factor: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptionResult {
    pub transcript_id: String,
    pub lecture_id: String,
    pub full_text: String,
    pub segments: Vec<TranscriptSegment>,
    pub model_used: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TranscriptUpdateResult {
    pub transcript_id: String,
    pub lecture_id: String,
    pub full_text: String,
    pub segments: Vec<TranscriptSegment>,
}

#[derive(Debug, Error)]
enum TranscribeError {
    #[error("Unsupported whisper model size: {0}.")]
    UnsupportedModelSize(String),
    #[error("Unable to access whisper model directory.")]
    WhisperModelDirUnavailable,
    #[error("Unable to download whisper model.")]
    WhisperModelDownloadFailed,
    #[error("The selected whisper model has not been downloaded yet. Download it from Settings before transcribing.")]
    WhisperModelMissing,
    #[error("Unable to read transcription settings: {0}")]
    SettingsReadFailed(String),
    #[error("Lecture not found for id: {0}.")]
    LectureNotFound(String),
    #[error("Unable to access lecture data.")]
    LectureDataUnavailable,
    #[error("Unable to update lecture status.")]
    LectureStatusUpdateFailed,
    #[error("Unable to prepare audio for transcription.")]
    AudioPreparationFailed,
    #[error("Unable to convert audio to 16kHz mono WAV.")]
    AudioConversionFailed,
    #[error("Unable to decode audio data.")]
    AudioDecodeFailed,
    #[error("Unable to resample audio for whisper.")]
    AudioResampleFailed,
    #[error("Unable to read converted WAV audio.")]
    WavReadFailed,
    #[error(
        "The audio appears to be silent or empty. Record again or choose a clearer audio file."
    )]
    SilentAudioDetected,
    #[error("Unable to initialize whisper.")]
    WhisperInitFailed,
    #[error("Whisper transcription failed.")]
    WhisperTranscriptionFailed,
    #[error("The transcript is empty. The audio may be silent or too unclear to transcribe.")]
    EmptyTranscript,
    #[error("Unable to save transcript to database.")]
    TranscriptSaveFailed,
    #[error("Transcript not found for id: {0}.")]
    TranscriptNotFound(String),
    #[error("Transcript segment index is out of range.")]
    TranscriptSegmentOutOfRange,
    #[error("Unable to parse transcript segments from database.")]
    TranscriptParseFailed,
    #[error("Unable to apply transcript edits.")]
    TranscriptUpdateFailed,
    #[error("Unable to resolve lecture audio file.")]
    LectureAudioFileUnavailable,
    #[error("Unable to authorize audio path for asset protocol.")]
    AssetScopeUpdateFailed,
    #[error("Background transcription worker failed.")]
    BackgroundTaskFailed,
}

impl From<TranscribeError> for String {
    fn from(value: TranscribeError) -> Self {
        value.to_string()
    }
}

#[tauri::command]
pub fn check_whisper_models() -> Result<Vec<String>, String> {
    check_whisper_models_impl().map_err(Into::into)
}

#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, model_size: String) -> Result<String, String> {
    download_whisper_model_impl(&app, &model_size)
        .await
        .map(|path| path.to_string_lossy().to_string())
        .map_err(Into::into)
}

#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    database: State<'_, AppDatabase>,
    lecture_id: String,
) -> Result<TranscriptionResult, String> {
    let settings = get_settings(app.clone()).map_err(TranscribeError::SettingsReadFailed)?;
    let model_path = get_model_path(&settings.whisper_model)?;
    if !model_path.exists() {
        return Err(TranscribeError::WhisperModelMissing.into());
    }

    let db_path = database.db_path().to_path_buf();
    let language = settings.language.clone();
    let model_used = settings.whisper_model.clone();
    let app_handle = app.clone();
    let worker_lecture_id = lecture_id.clone();
    let worker_model_path = model_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        transcribe_audio_impl(
            app_handle,
            db_path,
            worker_lecture_id,
            worker_model_path,
            language,
            model_used,
        )
    })
    .await
    .map_err(|_| TranscribeError::BackgroundTaskFailed)?
    .map_err(Into::into)
}

#[tauri::command]
pub fn update_transcript_segment(
    database: State<'_, AppDatabase>,
    transcript_id: String,
    segment_index: usize,
    new_text: String,
) -> Result<TranscriptUpdateResult, String> {
    update_transcript_segment_impl(database.inner(), transcript_id, segment_index, new_text)
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_lecture_audio_url(
    app: AppHandle,
    database: State<'_, AppDatabase>,
    lecture_id: String,
) -> Result<String, String> {
    get_lecture_audio_url_impl(&app, database.inner(), lecture_id).map_err(Into::into)
}

#[tauri::command]
pub fn get_lecture_transcript(
    database: State<'_, AppDatabase>,
    lecture_id: String,
) -> Result<Option<TranscriptionResult>, String> {
    get_lecture_transcript_impl(database.inner(), lecture_id).map_err(Into::into)
}

fn update_transcript_segment_impl(
    database: &AppDatabase,
    transcript_id: String,
    segment_index: usize,
    new_text: String,
) -> Result<TranscriptUpdateResult, TranscribeError> {
    let connection = database
        .connect()
        .map_err(|_| TranscribeError::LectureDataUnavailable)?;
    let transcript = get_transcript_by_id(&connection, &transcript_id)
        .map_err(|_| TranscribeError::LectureDataUnavailable)?
        .ok_or_else(|| TranscribeError::TranscriptNotFound(transcript_id.clone()))?;

    let mut segments: Vec<TranscriptSegment> = serde_json::from_str(&transcript.segments_json)
        .map_err(|_| TranscribeError::TranscriptParseFailed)?;
    if segment_index >= segments.len() {
        return Err(TranscribeError::TranscriptSegmentOutOfRange);
    }

    segments[segment_index].text = new_text;
    let full_text = rebuild_full_text(&segments);
    let segments_json =
        serde_json::to_string(&segments).map_err(|_| TranscribeError::TranscriptUpdateFailed)?;

    update_transcript_content(&connection, &transcript_id, &full_text, &segments_json)
        .map_err(|_| TranscribeError::TranscriptUpdateFailed)?;

    Ok(TranscriptUpdateResult {
        transcript_id,
        lecture_id: transcript.lecture_id,
        full_text,
        segments,
    })
}

fn get_lecture_audio_url_impl(
    app: &AppHandle,
    database: &AppDatabase,
    lecture_id: String,
) -> Result<String, TranscribeError> {
    let connection = database
        .connect()
        .map_err(|_| TranscribeError::LectureDataUnavailable)?;
    let lecture = get_lecture_by_id(&connection, &lecture_id)
        .map_err(|_| TranscribeError::LectureDataUnavailable)?
        .ok_or_else(|| TranscribeError::LectureNotFound(lecture_id.clone()))?;

    // Prefer the 16kHz mono WAV prepared for Whisper, which is generally more
    // reliable for embedded webview playback than arbitrary source formats.
    let preferred_path = prepared_audio_path(app, &lecture_id)
        .filter(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from(&lecture.audio_path));

    let audio_path = preferred_path;
    if !audio_path.exists() {
        return Err(TranscribeError::LectureAudioFileUnavailable);
    }

    let canonical_path = audio_path
        .canonicalize()
        .map_err(|_| TranscribeError::LectureAudioFileUnavailable)?;

    app.asset_protocol_scope()
        .allow_file(&canonical_path)
        .map_err(|_| TranscribeError::AssetScopeUpdateFailed)?;

    Ok(canonical_path.to_string_lossy().to_string())
}

fn prepared_audio_path(app: &AppHandle, lecture_id: &str) -> Option<PathBuf> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    Some(
        app_data_dir
            .join("prepared-audio")
            .join(format!("{lecture_id}-16khz-mono.wav")),
    )
}

fn get_lecture_transcript_impl(
    database: &AppDatabase,
    lecture_id: String,
) -> Result<Option<TranscriptionResult>, TranscribeError> {
    let connection = database
        .connect()
        .map_err(|_| TranscribeError::LectureDataUnavailable)?;
    let transcript = get_transcript_by_lecture_id(&connection, &lecture_id)
        .map_err(|_| TranscribeError::LectureDataUnavailable)?;

    let Some(record) = transcript else {
        return Ok(None);
    };

    let segments: Vec<TranscriptSegment> = serde_json::from_str(&record.segments_json)
        .map_err(|_| TranscribeError::TranscriptParseFailed)?;

    Ok(Some(TranscriptionResult {
        transcript_id: record.id,
        lecture_id: record.lecture_id,
        full_text: record.full_text,
        segments,
        model_used: record.model_used,
    }))
}

fn rebuild_full_text(segments: &[TranscriptSegment]) -> String {
    let mut full_text = String::new();
    for segment in segments {
        let text = segment.text.trim();
        if text.is_empty() {
            continue;
        }

        if !full_text.is_empty() {
            full_text.push(' ');
        }
        full_text.push_str(text);
    }

    full_text
}

fn check_whisper_models_impl() -> Result<Vec<String>, TranscribeError> {
    let model_dir = whisper_models_dir()?;
    if !model_dir.exists() {
        return Ok(Vec::new());
    }

    let mut models = Vec::new();
    for entry in fs::read_dir(model_dir).map_err(|_| TranscribeError::WhisperModelDirUnavailable)? {
        let entry = entry.map_err(|_| TranscribeError::WhisperModelDirUnavailable)?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if file_name.starts_with("ggml-") && file_name.ends_with(".bin") {
            models.push(file_name.to_string());
        }
    }

    models.sort();
    Ok(models)
}

async fn download_whisper_model_impl(
    app: &AppHandle,
    model_size: &str,
) -> Result<PathBuf, TranscribeError> {
    let target_path = get_model_path(model_size)?;
    if target_path.exists() {
        app.emit(
            "whisper-download-progress",
            DownloadProgressEvent {
                percent: 100,
                model_size: model_size.to_string(),
            },
        )
        .ok();
        return Ok(target_path);
    }

    let file_name = model_file_name(model_size)?;
    let download_url = format!("{WHISPER_MODEL_REPOSITORY}/{file_name}");
    let temp_path = target_path.with_extension("download");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 30))
        .build()
        .map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;
    let response = client
        .get(download_url)
        .send()
        .await
        .map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;
    if !response.status().is_success() {
        return Err(TranscribeError::WhisperModelDownloadFailed);
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;
    let mut downloaded = 0_u64;
    let mut last_percent = 0_u8;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;
        file.write_all(&chunk)
            .await
            .map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);

        if total_size > 0 {
            let percent = ((downloaded.saturating_mul(100) / total_size).min(100)) as u8;
            if percent != last_percent {
                last_percent = percent;
                app.emit(
                    "whisper-download-progress",
                    DownloadProgressEvent {
                        percent,
                        model_size: model_size.to_string(),
                    },
                )
                .ok();
            }
        }
    }

    file.flush()
        .await
        .map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;
    tokio::fs::rename(&temp_path, &target_path)
        .await
        .map_err(|_| TranscribeError::WhisperModelDownloadFailed)?;

    app.emit(
        "whisper-download-progress",
        DownloadProgressEvent {
            percent: 100,
            model_size: model_size.to_string(),
        },
    )
    .ok();

    Ok(target_path)
}

fn transcribe_audio_impl(
    app: AppHandle,
    db_path: PathBuf,
    lecture_id: String,
    model_path: PathBuf,
    language: String,
    model_used: String,
) -> Result<TranscriptionResult, TranscribeError> {
    let database = AppDatabase::new(db_path);
    let outcome = (|| -> Result<TranscriptionResult, TranscribeError> {
        let connection = database
            .connect()
            .map_err(|_| TranscribeError::LectureDataUnavailable)?;
        let lecture = get_lecture_by_id(&connection, &lecture_id)
            .map_err(|_| TranscribeError::LectureDataUnavailable)?
            .ok_or_else(|| TranscribeError::LectureNotFound(lecture_id.clone()))?;
        update_lecture_status(&connection, &lecture_id, "transcribing")
            .map_err(|_| TranscribeError::LectureStatusUpdateFailed)?;
        drop(connection);

        emit_transcription_progress(&app, &lecture_id, 3);
        let prepared_audio_path =
            prepare_audio_for_whisper(&app, &lecture_id, Path::new(&lecture.audio_path))?;
        if is_wav_silent(&prepared_audio_path)? {
            return Err(TranscribeError::SilentAudioDetected);
        }
        emit_transcription_progress(&app, &lecture_id, 10);

        let total_samples = read_wav_total_samples(&prepared_audio_path)?;
        let total_audio_seconds = total_samples as f64 / TARGET_SAMPLE_RATE as f64;
        let started_at = Instant::now();

        let mut segments: Vec<TranscriptSegment> = Vec::new();
        if total_audio_seconds > LONG_AUDIO_THRESHOLD_SECONDS {
            let chunk_samples = (TRANSCRIPTION_CHUNK_SECONDS * TARGET_SAMPLE_RATE as f64) as usize;
            let overlap_samples =
                (TRANSCRIPTION_OVERLAP_SECONDS * TARGET_SAMPLE_RATE as f64) as usize;

            let mut windows: Vec<(usize, usize, usize, usize)> = Vec::new();
            let mut chunk_start_unique = 0usize;
            while chunk_start_unique < total_samples {
                let chunk_end_unique = (chunk_start_unique + chunk_samples).min(total_samples);
                let read_start = chunk_start_unique.saturating_sub(overlap_samples);
                let read_end = (chunk_end_unique + overlap_samples).min(total_samples);
                windows.push((read_start, read_end, chunk_start_unique, chunk_end_unique));
                chunk_start_unique = chunk_end_unique;
            }

            let chunk_total = windows.len() as u32;
            let mut last_segment_end = 0.0_f64;

            for (index, (read_start, read_end, unique_start, unique_end)) in
                windows.iter().enumerate()
            {
                let whisper_input =
                    read_wav_samples_range(&prepared_audio_path, *read_start, *read_end)?;
                let chunk_context = ChunkProgressContext {
                    chunk_index: (index + 1) as u32,
                    chunk_total,
                    chunk_offset_seconds: *read_start as f64 / TARGET_SAMPLE_RATE as f64,
                    chunk_unique_seconds: (*unique_end - *unique_start) as f64
                        / TARGET_SAMPLE_RATE as f64,
                    processed_unique_seconds_before: *unique_start as f64
                        / TARGET_SAMPLE_RATE as f64,
                    total_audio_seconds,
                };
                let chunk_segments = run_whisper_transcription(
                    &app,
                    &lecture_id,
                    &model_path,
                    &language,
                    &whisper_input,
                    chunk_context,
                    started_at,
                )?;

                let unique_start_seconds = *unique_start as f64 / TARGET_SAMPLE_RATE as f64;
                let unique_end_seconds = *unique_end as f64 / TARGET_SAMPLE_RATE as f64;

                for mut segment in chunk_segments {
                    if segment.end <= unique_start_seconds || segment.start >= unique_end_seconds {
                        continue;
                    }

                    segment.start = segment.start.max(unique_start_seconds);
                    segment.end = segment.end.min(unique_end_seconds);
                    if segment.end <= segment.start {
                        continue;
                    }

                    if segment.end <= last_segment_end + 0.05 {
                        continue;
                    }
                    if segment.start < last_segment_end {
                        segment.start = last_segment_end;
                    }
                    last_segment_end = segment.end;
                    segments.push(segment);
                }
            }
        } else {
            let whisper_input = read_wav_samples(&prepared_audio_path)?;
            let chunk_context = ChunkProgressContext {
                chunk_index: 1,
                chunk_total: 1,
                chunk_offset_seconds: 0.0,
                chunk_unique_seconds: total_audio_seconds,
                processed_unique_seconds_before: 0.0,
                total_audio_seconds,
            };
            segments = run_whisper_transcription(
                &app,
                &lecture_id,
                &model_path,
                &language,
                &whisper_input,
                chunk_context,
                started_at,
            )?;
        }

        let full_text = rebuild_full_text(&segments);
        if full_text.split_whitespace().next().is_none() {
            return Err(TranscribeError::EmptyTranscript);
        }

        let segments_json =
            serde_json::to_string(&segments).map_err(|_| TranscribeError::TranscriptSaveFailed)?;
        let transcript_record = TranscriptRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.clone(),
            full_text: full_text.clone(),
            segments_json,
            model_used,
            created_at: Utc::now().to_rfc3339(),
        };

        let mut transcription = TranscriptionResult {
            transcript_id: String::new(),
            lecture_id: lecture_id.clone(),
            full_text,
            segments,
            model_used: transcript_record.model_used.clone(),
        };

        let connection = database
            .connect()
            .map_err(|_| TranscribeError::LectureDataUnavailable)?;
        upsert_transcript(&connection, &transcript_record)
            .map_err(|_| TranscribeError::TranscriptSaveFailed)?;
        update_lecture_status(&connection, &lecture_id, "processing")
            .map_err(|_| TranscribeError::LectureStatusUpdateFailed)?;

        emit_transcription_progress(&app, &lecture_id, 100);
        transcription.transcript_id = transcript_record.id.clone();
        transcription.model_used = transcript_record.model_used;
        Ok(transcription)
    })();

    if outcome.is_err() {
        if let Ok(connection) = database.connect() {
            let _ = update_lecture_status(&connection, &lecture_id, "error");
        }
    }

    outcome
}

#[derive(Clone, Copy)]
struct ChunkProgressContext {
    chunk_index: u32,
    chunk_total: u32,
    chunk_offset_seconds: f64,
    chunk_unique_seconds: f64,
    processed_unique_seconds_before: f64,
    total_audio_seconds: f64,
}

fn run_whisper_transcription(
    app: &AppHandle,
    lecture_id: &str,
    model_path: &Path,
    language: &str,
    whisper_input: &[f32],
    progress_context: ChunkProgressContext,
    started_at: Instant,
) -> Result<Vec<TranscriptSegment>, TranscribeError> {
    let model_path_string = model_path.to_string_lossy().to_string();
    let context =
        WhisperContext::new_with_params(&model_path_string, WhisperContextParameters::default())
            .map_err(|_| TranscribeError::WhisperInitFailed)?;
    let mut state = context
        .create_state()
        .map_err(|_| TranscribeError::WhisperInitFailed)?;

    let progress_app = app.clone();
    let progress_lecture_id = lecture_id.to_string();
    let total_audio_seconds = progress_context.total_audio_seconds.max(1.0);

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_n_threads(4);
    params.set_translate(false);
    if !language.trim().is_empty() && language != "auto" {
        params.set_language(Some(language));
    }
    params.set_progress_callback_safe(move |progress: i32| {
        let chunk_percent = progress.clamp(0, 100) as u8;
        let processed_unique_seconds = progress_context.processed_unique_seconds_before
            + progress_context.chunk_unique_seconds * (chunk_percent as f64 / 100.0);
        let overall_ratio = (processed_unique_seconds / total_audio_seconds).clamp(0.0, 1.0);
        let overall_percent = (10.0 + overall_ratio * 89.0).round().clamp(10.0, 99.0) as u8;

        let elapsed = started_at.elapsed().as_secs_f64();
        let realtime_factor = if elapsed > 0.0 {
            Some(processed_unique_seconds / elapsed)
        } else {
            None
        };
        let eta_seconds = realtime_factor
            .filter(|factor| *factor > 0.0)
            .map(|factor| {
                ((total_audio_seconds - processed_unique_seconds).max(0.0) / factor).ceil() as u64
            });

        emit_transcription_progress_detailed(
            &progress_app,
            &progress_lecture_id,
            overall_percent,
            Some(progress_context.chunk_index),
            Some(progress_context.chunk_total),
            Some(chunk_percent),
            eta_seconds,
            realtime_factor,
        );
    });

    state
        .full(params, whisper_input)
        .map_err(|_| TranscribeError::WhisperTranscriptionFailed)?;

    let segment_count = state.full_n_segments().max(0) as usize;
    let mut segments = Vec::with_capacity(segment_count);

    for index in 0..segment_count {
        let Some(segment) = state.get_segment(index as i32) else {
            continue;
        };

        let text = segment
            .to_str_lossy()
            .map_err(|_| TranscribeError::WhisperTranscriptionFailed)?
            .trim()
            .to_string();
        let start = segment.start_timestamp() as f64 / 100.0;
        let end = segment.end_timestamp() as f64 / 100.0;

        segments.push(TranscriptSegment { start, end, text });
    }

    for segment in &mut segments {
        segment.start += progress_context.chunk_offset_seconds;
        segment.end += progress_context.chunk_offset_seconds;
    }

    Ok(segments)
}

fn prepare_audio_for_whisper(
    app: &AppHandle,
    lecture_id: &str,
    source_path: &Path,
) -> Result<PathBuf, TranscribeError> {
    if !source_path.exists() {
        return Err(TranscribeError::AudioPreparationFailed);
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| TranscribeError::AudioPreparationFailed)?;
    let prepared_dir = app_data_dir.join("prepared-audio");
    fs::create_dir_all(&prepared_dir).map_err(|_| TranscribeError::AudioPreparationFailed)?;
    let prepared_path = prepared_dir.join(format!("{lecture_id}-16khz-mono.wav"));

    if convert_audio_with_ffmpeg(app, source_path, &prepared_path) {
        return Ok(prepared_path);
    }

    convert_audio_with_rust(source_path, &prepared_path)?;
    Ok(prepared_path)
}

fn convert_audio_with_ffmpeg(app: &AppHandle, source_path: &Path, target_path: &Path) -> bool {
    let ffmpeg_path = resolve_ffmpeg_path(Some(app));
    let status = std::process::Command::new(ffmpeg_path)
        .arg("-y")
        .arg("-i")
        .arg(source_path.as_os_str())
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-f")
        .arg("wav")
        .arg(target_path.as_os_str())
        .status();

    match status {
        Ok(exit_status) => exit_status.success(),
        Err(_) => false,
    }
}

fn convert_audio_with_rust(source_path: &Path, target_path: &Path) -> Result<(), TranscribeError> {
    let (samples, sample_rate) = decode_audio_to_mono_f32(source_path)?;
    let resampled = resample_to_target_rate(samples, sample_rate)?;

    let wav_spec = WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let writer = WavWriter::create(target_path, wav_spec)
        .map_err(|_| TranscribeError::AudioConversionFailed)?;
    let mut writer = writer;

    for sample in resampled {
        let quantized = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer
            .write_sample(quantized)
            .map_err(|_| TranscribeError::AudioConversionFailed)?;
    }
    writer
        .finalize()
        .map_err(|_| TranscribeError::AudioConversionFailed)?;
    Ok(())
}

fn decode_audio_to_mono_f32(source_path: &Path) -> Result<(Vec<f32>, u32), TranscribeError> {
    let file = File::open(source_path).map_err(|_| TranscribeError::AudioDecodeFailed)?;
    let mut hint = Hint::new();
    if let Some(extension) = source_path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }

    let source = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| TranscribeError::AudioDecodeFailed)?;
    let mut format = probed.format;

    let track = format
        .default_track()
        .ok_or(TranscribeError::AudioDecodeFailed)?;
    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .ok_or(TranscribeError::AudioDecodeFailed)?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|_| TranscribeError::AudioDecodeFailed)?;

    let mut samples = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::ResetRequired) => continue,
            Err(_) => return Err(TranscribeError::AudioDecodeFailed),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(_) => return Err(TranscribeError::AudioDecodeFailed),
        };

        let channels = decoded.spec().channels.count().max(1);
        let mut sample_buffer =
            SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        sample_buffer.copy_interleaved_ref(decoded);
        for frame in sample_buffer.samples().chunks(channels) {
            let sum: f32 = frame.iter().copied().sum();
            samples.push(sum / channels as f32);
        }
    }

    if samples.is_empty() {
        return Err(TranscribeError::AudioDecodeFailed);
    }

    Ok((samples, sample_rate))
}

fn resample_to_target_rate(
    samples: Vec<f32>,
    sample_rate: u32,
) -> Result<Vec<f32>, TranscribeError> {
    if sample_rate == TARGET_SAMPLE_RATE {
        return Ok(samples);
    }

    let mut resampler =
        FftFixedInOut::<f32>::new(sample_rate as usize, TARGET_SAMPLE_RATE as usize, 1024, 1)
            .map_err(|_| TranscribeError::AudioResampleFailed)?;
    let input_frames = resampler.input_frames_next();
    let output_frames = resampler.output_frames_next();

    let mut resampled = Vec::new();
    let mut cursor = 0usize;
    while cursor < samples.len() {
        let end = (cursor + input_frames).min(samples.len());
        let mut input_chunk = samples[cursor..end].to_vec();
        if input_chunk.len() < input_frames {
            input_chunk.resize(input_frames, 0.0);
        }

        let input = vec![input_chunk];
        let mut output = vec![vec![0.0_f32; output_frames]];
        let (_, produced) = resampler
            .process_into_buffer(&input, &mut output, None)
            .map_err(|_| TranscribeError::AudioResampleFailed)?;
        resampled.extend_from_slice(&output[0][..produced]);
        cursor += input_frames;
    }

    Ok(resampled)
}

fn read_wav_samples(path: &Path) -> Result<Vec<f32>, TranscribeError> {
    let mut reader = WavReader::open(path).map_err(|_| TranscribeError::WavReadFailed)?;
    let spec = reader.spec();
    if spec.channels != 1 || spec.sample_rate != TARGET_SAMPLE_RATE {
        return Err(TranscribeError::WavReadFailed);
    }

    match spec.sample_format {
        SampleFormat::Int => {
            if spec.bits_per_sample <= 16 {
                let mut values = Vec::new();
                for sample in reader.samples::<i16>() {
                    let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                    values.push(sample as f32 / i16::MAX as f32);
                }
                Ok(values)
            } else {
                let mut values = Vec::new();
                for sample in reader.samples::<i32>() {
                    let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                    values.push(sample as f32 / i32::MAX as f32);
                }
                Ok(values)
            }
        }
        SampleFormat::Float => {
            let mut values = Vec::new();
            for sample in reader.samples::<f32>() {
                values.push(sample.map_err(|_| TranscribeError::WavReadFailed)?);
            }
            Ok(values)
        }
    }
}

fn read_wav_total_samples(path: &Path) -> Result<usize, TranscribeError> {
    let reader = WavReader::open(path).map_err(|_| TranscribeError::WavReadFailed)?;
    let spec = reader.spec();
    if spec.channels != 1 || spec.sample_rate != TARGET_SAMPLE_RATE {
        return Err(TranscribeError::WavReadFailed);
    }
    Ok(reader.duration() as usize)
}

fn read_wav_samples_range(
    path: &Path,
    start_sample: usize,
    end_sample: usize,
) -> Result<Vec<f32>, TranscribeError> {
    if end_sample <= start_sample {
        return Ok(Vec::new());
    }

    let mut reader = WavReader::open(path).map_err(|_| TranscribeError::WavReadFailed)?;
    let spec = reader.spec();
    if spec.channels != 1 || spec.sample_rate != TARGET_SAMPLE_RATE {
        return Err(TranscribeError::WavReadFailed);
    }

    if reader.seek(start_sample as u32).is_err() {
        return Err(TranscribeError::WavReadFailed);
    }

    let count = end_sample - start_sample;
    let mut values = Vec::with_capacity(count);
    match spec.sample_format {
        SampleFormat::Int => {
            if spec.bits_per_sample <= 16 {
                for sample in reader.samples::<i16>().take(count) {
                    let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                    values.push(sample as f32 / i16::MAX as f32);
                }
            } else {
                for sample in reader.samples::<i32>().take(count) {
                    let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                    values.push(sample as f32 / i32::MAX as f32);
                }
            }
        }
        SampleFormat::Float => {
            for sample in reader.samples::<f32>().take(count) {
                values.push(sample.map_err(|_| TranscribeError::WavReadFailed)?);
            }
        }
    }

    Ok(values)
}

fn is_wav_silent(path: &Path) -> Result<bool, TranscribeError> {
    let mut reader = WavReader::open(path).map_err(|_| TranscribeError::WavReadFailed)?;
    let spec = reader.spec();
    if spec.channels != 1 || spec.sample_rate != TARGET_SAMPLE_RATE {
        return Err(TranscribeError::WavReadFailed);
    }

    let mut sum_abs = 0.0_f32;
    let mut peak = 0.0_f32;
    let mut count = 0usize;

    match spec.sample_format {
        SampleFormat::Int => {
            if spec.bits_per_sample <= 16 {
                for sample in reader.samples::<i16>() {
                    let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                    let amplitude = (sample as f32 / i16::MAX as f32).abs();
                    sum_abs += amplitude;
                    if amplitude > peak {
                        peak = amplitude;
                    }
                    count += 1;
                }
            } else {
                for sample in reader.samples::<i32>() {
                    let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                    let amplitude = (sample as f32 / i32::MAX as f32).abs();
                    sum_abs += amplitude;
                    if amplitude > peak {
                        peak = amplitude;
                    }
                    count += 1;
                }
            }
        }
        SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                let sample = sample.map_err(|_| TranscribeError::WavReadFailed)?;
                let amplitude = sample.abs();
                sum_abs += amplitude;
                if amplitude > peak {
                    peak = amplitude;
                }
                count += 1;
            }
        }
    }

    if count == 0 {
        return Ok(true);
    }

    let average = sum_abs / count as f32;
    Ok(average < SILENCE_AVERAGE_THRESHOLD && peak < SILENCE_PEAK_THRESHOLD)
}

fn whisper_models_dir() -> Result<PathBuf, TranscribeError> {
    let models_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("whisper-models");
    fs::create_dir_all(&models_dir).map_err(|_| TranscribeError::WhisperModelDirUnavailable)?;
    Ok(models_dir)
}

fn model_file_name(model_size: &str) -> Result<&'static str, TranscribeError> {
    match model_size {
        "tiny" => Ok("ggml-tiny.bin"),
        "base" => Ok("ggml-base.bin"),
        "small" => Ok("ggml-small.bin"),
        "medium" => Ok("ggml-medium.bin"),
        "large" => Ok("ggml-large.bin"),
        unsupported => Err(TranscribeError::UnsupportedModelSize(
            unsupported.to_string(),
        )),
    }
}

fn get_model_path(model_size: &str) -> Result<PathBuf, TranscribeError> {
    let model_file = model_file_name(model_size)?;
    Ok(whisper_models_dir()?.join(model_file))
}

fn emit_transcription_progress(app: &AppHandle, lecture_id: &str, percent: u8) {
    emit_transcription_progress_detailed(app, lecture_id, percent, None, None, None, None, None);
}

fn emit_transcription_progress_detailed(
    app: &AppHandle,
    lecture_id: &str,
    percent: u8,
    chunk_index: Option<u32>,
    chunk_total: Option<u32>,
    chunk_percent: Option<u8>,
    eta_seconds: Option<u64>,
    realtime_factor: Option<f64>,
) {
    app.emit(
        "transcription-progress",
        TranscriptionProgressEvent {
            lecture_id: lecture_id.to_string(),
            percent,
            chunk_index,
            chunk_total,
            chunk_percent,
            eta_seconds,
            realtime_factor,
        },
    )
    .ok();
}
