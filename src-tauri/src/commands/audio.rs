use crate::db::queries::{upsert_lecture, LectureRecord};
use crate::db::AppDatabase;
use crate::utils::ffmpeg::resolve_ffmpeg_path;
use crate::utils::ytdlp::ensure_ytdlp_installed;
use chrono::Utc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use fs2::available_space;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, Track};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use tauri::{AppHandle, Emitter, Manager, State};
use thiserror::Error;
use uuid::Uuid;

const SUPPORTED_AUDIO_EXTENSIONS: [&str; 4] = ["mp3", "wav", "m4a", "ogg"];
const SUPPORTED_VIDEO_EXTENSIONS: [&str; 6] = ["mp4", "mov", "mkv", "webm", "avi", "m4v"];
const SUPPORTED_EXTENSIONS: [&str; 10] = [
    "mp3", "wav", "m4a", "ogg", "mp4", "mov", "mkv", "webm", "avi", "m4v",
];
const MIN_RECORDING_FREE_SPACE_BYTES: u64 = 64 * 1024 * 1024;
const MIN_VIDEO_IMPORT_FREE_SPACE_BYTES: u64 = 256 * 1024 * 1024;
const MIN_YOUTUBE_IMPORT_FREE_SPACE_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SourceType {
    Audio,
    Video,
}

impl SourceType {
    fn as_str(self) -> &'static str {
        match self {
            Self::Audio => "audio",
            Self::Video => "video",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioFileMetadata {
    pub id: String,
    pub filename: String,
    pub path: String,
    pub duration_seconds: f64,
    pub size_bytes: u64,
    pub source_type: String,
}

#[derive(Debug, Clone, Serialize)]
struct RecordingLevelEvent {
    recording_id: String,
    level: u8,
}

#[derive(Debug, Clone, Serialize)]
struct YoutubeImportProgressEvent {
    url: String,
    stage: String,
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct YtDlpVideoMetadata {
    title: Option<String>,
    id: Option<String>,
}

#[derive(Debug, Clone, Error)]
enum AudioError {
    #[error("The selected file does not exist.")]
    FileNotFound,
    #[error("The selected path is not a file.")]
    NotAFile,
    #[error(
        "Unsupported file extension: {0}. Supported formats are mp3, wav, m4a, ogg, mp4, mov, mkv, webm, avi, m4v."
    )]
    UnsupportedExtension(String),
    #[error("Unable to access the app data directory.")]
    AppDataDirUnavailable,
    #[error("Unable to check available disk space.")]
    DiskSpaceCheckFailed,
    #[error("Not enough free disk space to save media data. Free up space and try again.")]
    DiskSpaceInsufficient,
    #[error("Failed to save the media file.")]
    SaveFailed,
    #[error(
        "Unable to find ffmpeg. Reinstall Knowte (bundled ffmpeg) or install ffmpeg on your system."
    )]
    FfmpegMissing,
    #[error(
        "Unable to extract audio from the video. This codec or container may not be supported. Convert to MP4 (H.264/AAC) and try again."
    )]
    UnsupportedVideoCodec,
    #[error(
        "Video conversion failed. Convert the video to MP4 with AAC audio and try uploading again."
    )]
    VideoExtractionFailed,
    #[error("Only YouTube URLs are supported. Use a youtube.com or youtu.be link.")]
    InvalidYouTubeUrl,
    #[error(
        "Unable to find yt-dlp. Reinstall Knowte (bundled yt-dlp) or install yt-dlp on your system."
    )]
    YtDlpMissing,
    #[error(
        "Unable to access this YouTube video. It may be private, removed, blocked, or age-restricted."
    )]
    YouTubeUnavailable,
    #[error("Unable to validate the YouTube URL. Confirm the link is public and reachable.")]
    YouTubeValidationFailed,
    #[error("Unable to download YouTube audio. Try another video or update yt-dlp.")]
    YouTubeDownloadFailed,
    #[error("Unable to read audio metadata. The file may be corrupt or unsupported.")]
    MetadataReadFailed,
    #[error("No readable audio track was found. The file may be corrupt or unsupported.")]
    MissingAudioTrack,
    #[error("No recording is currently in progress.")]
    NoActiveRecording,
    #[error("The requested recording session does not exist.")]
    RecordingIdMismatch,
    #[error("A recording is already in progress.")]
    RecordingAlreadyInProgress,
    #[error("No microphone input device was found.")]
    InputDeviceUnavailable,
    #[error("Unable to read the microphone configuration.")]
    InputConfigUnavailable,
    #[error("Unable to start microphone recording.")]
    StartRecordingFailed,
    #[error("Unable to finalize the recording.")]
    FinalizeRecordingFailed,
    #[error("Failed to lock recording state.")]
    StateLockFailed,
    #[error("Unable to update lecture records.")]
    DatabaseFailed,
    #[error("Media import worker failed.")]
    BackgroundTaskFailed,
}

impl From<AudioError> for String {
    fn from(value: AudioError) -> Self {
        value.to_string()
    }
}

struct RecordingSession {
    id: String,
    output_path: PathBuf,
    stop_signal: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<Result<(), AudioError>>>,
}

#[derive(Default)]
pub struct RecordingState {
    session: Mutex<Option<RecordingSession>>,
}

#[tauri::command]
pub fn pick_audio_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .add_filter("Audio and Video", &SUPPORTED_EXTENSIONS)
        .pick_file();

    Ok(file.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn pick_audio_files() -> Result<Vec<String>, String> {
    let files = rfd::FileDialog::new()
        .add_filter("Audio and Video", &SUPPORTED_EXTENSIONS)
        .pick_files()
        .unwrap_or_default();

    Ok(files
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
pub async fn accept_audio_file(
    app: AppHandle,
    database: State<'_, AppDatabase>,
    path: String,
) -> Result<AudioFileMetadata, String> {
    let app_handle = app.clone();
    let database_handle = database.inner().clone();
    let worker_path = path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        accept_audio_file_impl(&app_handle, &database_handle, &worker_path)
    })
    .await
    .map_err(|_| AudioError::BackgroundTaskFailed)?
    .map_err(Into::into)
}

#[tauri::command]
pub async fn import_youtube_audio(
    app: AppHandle,
    database: State<'_, AppDatabase>,
    url: String,
) -> Result<AudioFileMetadata, String> {
    let app_handle = app.clone();
    let database_handle = database.inner().clone();
    let worker_url = url.clone();

    tauri::async_runtime::spawn_blocking(move || {
        import_youtube_audio_impl(&app_handle, &database_handle, &worker_url)
    })
    .await
    .map_err(|_| AudioError::BackgroundTaskFailed)?
    .map_err(Into::into)
}

#[tauri::command]
pub fn start_recording(app: AppHandle, state: State<'_, RecordingState>) -> Result<String, String> {
    start_recording_impl(&app, state.inner()).map_err(Into::into)
}

#[tauri::command]
pub fn stop_recording(
    app: AppHandle,
    database: State<'_, AppDatabase>,
    state: State<'_, RecordingState>,
    recording_id: String,
) -> Result<AudioFileMetadata, String> {
    stop_recording_impl(&app, database.inner(), state.inner(), recording_id).map_err(Into::into)
}

fn accept_audio_file_impl(
    app: &AppHandle,
    database: &AppDatabase,
    path: &str,
) -> Result<AudioFileMetadata, AudioError> {
    let source_path = PathBuf::from(path);

    if !source_path.exists() {
        return Err(AudioError::FileNotFound);
    }
    if !source_path.is_file() {
        return Err(AudioError::NotAFile);
    }

    let (extension, source_type) = get_extension_and_source_type(&source_path)?;
    let id = Uuid::new_v4().to_string();
    let lectures_dir = get_lectures_dir(app)?;
    let source_size = fs::metadata(&source_path)
        .map_err(|_| AudioError::MetadataReadFailed)?
        .len();
    let estimated_bytes = match source_type {
        SourceType::Audio => source_size,
        SourceType::Video => source_size
            .saturating_mul(2)
            .max(MIN_VIDEO_IMPORT_FREE_SPACE_BYTES),
    };
    ensure_available_space(&lectures_dir, estimated_bytes)?;

    let destination_path = match source_type {
        SourceType::Audio => lectures_dir.join(format!("{id}.{extension}")),
        SourceType::Video => lectures_dir.join(format!("{id}.wav")),
    };

    if source_type == SourceType::Audio {
        fs::copy(&source_path, &destination_path).map_err(|_| AudioError::SaveFailed)?;
    } else {
        extract_video_audio(app, &source_path, &destination_path)?;
    }

    let filename = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{id}.{extension}"));

    let metadata = build_audio_metadata(id, filename, &destination_path, source_type)?;
    persist_lecture_metadata(database, &metadata)?;
    Ok(metadata)
}

fn import_youtube_audio_impl(
    app: &AppHandle,
    database: &AppDatabase,
    url: &str,
) -> Result<AudioFileMetadata, AudioError> {
    let event_url = url.trim().to_string();
    emit_youtube_import_progress(app, &event_url, "validating_url", None);

    let result = import_youtube_audio_inner(app, database, url);
    if let Err(error) = &result {
        emit_youtube_import_progress(app, &event_url, "error", Some(error.to_string()));
    }

    result
}

fn import_youtube_audio_inner(
    app: &AppHandle,
    database: &AppDatabase,
    url: &str,
) -> Result<AudioFileMetadata, AudioError> {
    let normalized_url = validate_youtube_url(url)?;
    let lectures_dir = get_lectures_dir(app)?;
    ensure_available_space(&lectures_dir, MIN_YOUTUBE_IMPORT_FREE_SPACE_BYTES)?;

    let yt_dlp_path = ensure_ytdlp_installed(app).map_err(|_| AudioError::YtDlpMissing)?;
    let ffmpeg_path = resolve_ffmpeg_path(Some(app));
    let video_title = fetch_youtube_title(&yt_dlp_path, &normalized_url)?;

    let id = Uuid::new_v4().to_string();
    let download_template = lectures_dir.join(format!("{id}.youtube.%(ext)s"));
    let destination_path = lectures_dir.join(format!("{id}.wav"));

    emit_youtube_import_progress(app, &normalized_url, "downloading", None);
    if let Err(error) = run_ytdlp_download(
        &yt_dlp_path,
        &normalized_url,
        &download_template,
        &ffmpeg_path,
    ) {
        cleanup_youtube_temp_files(&lectures_dir, &id);
        return Err(error);
    }

    let downloaded_path = find_downloaded_youtube_media(&lectures_dir, &id)?;
    emit_youtube_import_progress(app, &normalized_url, "extracting_audio", None);
    if let Err(error) =
        normalize_downloaded_audio(&ffmpeg_path, &downloaded_path, &destination_path)
    {
        fs::remove_file(&downloaded_path).ok();
        fs::remove_file(&destination_path).ok();
        cleanup_youtube_temp_files(&lectures_dir, &id);
        return Err(error);
    }

    fs::remove_file(&downloaded_path).ok();
    cleanup_youtube_temp_files(&lectures_dir, &id);

    let sanitized_title = sanitize_youtube_title(&video_title);
    let filename = format!("{sanitized_title}.wav");
    let metadata = build_audio_metadata(id, filename, &destination_path, SourceType::Audio)?;
    persist_lecture_metadata(database, &metadata)?;
    emit_youtube_import_progress(app, &normalized_url, "ready", None);
    Ok(metadata)
}

fn validate_youtube_url(url: &str) -> Result<String, AudioError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(AudioError::InvalidYouTubeUrl);
    }

    let parsed = Url::parse(trimmed).map_err(|_| AudioError::InvalidYouTubeUrl)?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(AudioError::InvalidYouTubeUrl);
    }

    let host = parsed
        .host_str()
        .map(|value| value.to_ascii_lowercase())
        .ok_or(AudioError::InvalidYouTubeUrl)?;
    let is_youtube_host =
        host == "youtu.be" || host == "youtube.com" || host.ends_with(".youtube.com");
    if !is_youtube_host {
        return Err(AudioError::InvalidYouTubeUrl);
    }

    if host == "youtu.be" {
        if parsed.path().trim_matches('/').is_empty() {
            return Err(AudioError::InvalidYouTubeUrl);
        }
    } else {
        let has_video_hint = parsed.query_pairs().any(|(key, _)| key == "v")
            || parsed.path().starts_with("/shorts/")
            || parsed.path().starts_with("/live/")
            || parsed.path().starts_with("/embed/")
            || parsed.path().starts_with("/watch");
        if !has_video_hint {
            return Err(AudioError::YouTubeValidationFailed);
        }
    }

    Ok(trimmed.to_string())
}

fn fetch_youtube_title(yt_dlp_path: &Path, url: &str) -> Result<String, AudioError> {
    let output = Command::new(yt_dlp_path)
        .arg("--skip-download")
        .arg("--dump-single-json")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(url)
        .output();

    let output = match output {
        Ok(output) => output,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AudioError::YtDlpMissing);
        }
        Err(_) => return Err(AudioError::YouTubeValidationFailed),
    };

    if !output.status.success() {
        return Err(map_ytdlp_failure(&String::from_utf8_lossy(&output.stderr)));
    }

    let metadata = serde_json::from_slice::<YtDlpVideoMetadata>(&output.stdout)
        .map_err(|_| AudioError::YouTubeValidationFailed)?;
    Ok(metadata
        .title
        .or(metadata.id)
        .unwrap_or_else(|| "YouTube Lecture".to_string()))
}

fn run_ytdlp_download(
    yt_dlp_path: &Path,
    url: &str,
    output_template: &Path,
    ffmpeg_path: &Path,
) -> Result<(), AudioError> {
    let child = Command::new(yt_dlp_path)
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg("--ignore-config")
        .arg("--newline")
        .arg("-f")
        .arg("bestaudio/best")
        .arg("-o")
        .arg(output_template.as_os_str())
        .arg("--ffmpeg-location")
        .arg(ffmpeg_path.as_os_str())
        .arg(url)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match child {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(AudioError::YtDlpMissing);
        }
        Err(_) => return Err(AudioError::YouTubeDownloadFailed),
    };

    let mut stderr = String::new();
    if let Some(stderr_pipe) = child.stderr.take() {
        let reader = BufReader::new(stderr_pipe);
        for line in reader.lines().map_while(Result::ok) {
            if stderr.len() > 16_000 {
                continue;
            }
            if !line.trim().is_empty() {
                if !stderr.is_empty() {
                    stderr.push('\n');
                }
                stderr.push_str(&line);
            }
        }
    }

    let status = child
        .wait()
        .map_err(|_| AudioError::YouTubeDownloadFailed)?;
    if status.success() {
        Ok(())
    } else {
        Err(map_ytdlp_failure(&stderr))
    }
}

fn find_downloaded_youtube_media(lectures_dir: &Path, id: &str) -> Result<PathBuf, AudioError> {
    let entries = fs::read_dir(lectures_dir).map_err(|_| AudioError::YouTubeDownloadFailed)?;
    let prefix = format!("{id}.youtube.");

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if name.starts_with(&prefix) {
            return Ok(path);
        }
    }

    Err(AudioError::YouTubeDownloadFailed)
}

fn normalize_downloaded_audio(
    ffmpeg_path: &Path,
    source_path: &Path,
    target_path: &Path,
) -> Result<(), AudioError> {
    let temp_output = target_path.with_extension("tmp.wav");
    let ffmpeg_output = Command::new(ffmpeg_path)
        .arg("-y")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(source_path.as_os_str())
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-f")
        .arg("wav")
        .arg(temp_output.as_os_str())
        .output();

    match ffmpeg_output {
        Ok(output) if output.status.success() => {
            fs::rename(&temp_output, target_path).map_err(|_| {
                fs::remove_file(&temp_output).ok();
                AudioError::SaveFailed
            })?;
            Ok(())
        }
        Ok(_) => {
            fs::remove_file(&temp_output).ok();
            Err(AudioError::YouTubeDownloadFailed)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::remove_file(&temp_output).ok();
            Err(AudioError::FfmpegMissing)
        }
        Err(_) => {
            fs::remove_file(&temp_output).ok();
            Err(AudioError::YouTubeDownloadFailed)
        }
    }
}

fn sanitize_youtube_title(raw_title: &str) -> String {
    let mut cleaned = String::new();
    for character in raw_title.chars() {
        if character.is_ascii_alphanumeric()
            || character == ' '
            || character == '-'
            || character == '_'
        {
            cleaned.push(character);
        } else {
            cleaned.push(' ');
        }
    }

    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = collapsed.chars().take(80).collect();
    let final_title = truncated.trim();
    if final_title.is_empty() {
        "YouTube Lecture".to_string()
    } else {
        final_title.to_string()
    }
}

fn cleanup_youtube_temp_files(lectures_dir: &Path, id: &str) {
    let Ok(entries) = fs::read_dir(lectures_dir) else {
        return;
    };
    let prefix = format!("{id}.youtube.");
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with(&prefix) {
            let _ = fs::remove_file(path);
        }
    }
}

fn map_ytdlp_failure(stderr: &str) -> AudioError {
    let normalized = stderr.to_ascii_lowercase();

    if normalized.contains("unsupported url")
        || normalized.contains("is not a valid url")
        || normalized.contains("invalid url")
    {
        return AudioError::InvalidYouTubeUrl;
    }

    if normalized.contains("private video")
        || normalized.contains("video unavailable")
        || normalized.contains("this video is unavailable")
        || normalized.contains("this video is private")
        || normalized.contains("members-only")
        || normalized.contains("age-restricted")
        || normalized.contains("sign in to confirm your age")
        || normalized.contains("not available in your country")
        || normalized.contains("http error 403")
        || normalized.contains("http error 404")
    {
        return AudioError::YouTubeUnavailable;
    }

    if normalized.contains("temporary failure in name resolution")
        || normalized.contains("name or service not known")
        || normalized.contains("connection refused")
        || normalized.contains("timed out")
    {
        return AudioError::YouTubeValidationFailed;
    }

    AudioError::YouTubeDownloadFailed
}

fn emit_youtube_import_progress(app: &AppHandle, url: &str, stage: &str, message: Option<String>) {
    let _ = app.emit(
        "youtube-import-progress",
        YoutubeImportProgressEvent {
            url: url.to_string(),
            stage: stage.to_string(),
            message,
        },
    );
}

fn start_recording_impl(app: &AppHandle, state: &RecordingState) -> Result<String, AudioError> {
    let mut session_guard = state
        .session
        .lock()
        .map_err(|_| AudioError::StateLockFailed)?;
    if session_guard.is_some() {
        return Err(AudioError::RecordingAlreadyInProgress);
    }

    let recording_id = Uuid::new_v4().to_string();
    let lectures_dir = get_lectures_dir(app)?;
    ensure_available_space(&lectures_dir, MIN_RECORDING_FREE_SPACE_BYTES)?;
    let recording_path = lectures_dir.join(format!("{recording_id}.wav"));
    let thread_app = app.clone();
    let thread_recording_id = recording_id.clone();
    let stop_signal = Arc::new(AtomicBool::new(false));
    let thread_stop_signal = Arc::clone(&stop_signal);
    let thread_recording_path = recording_path.clone();
    let (init_tx, init_rx) = mpsc::channel::<Result<(), AudioError>>();

    let worker = thread::spawn(move || {
        run_recording_worker(
            thread_app,
            thread_recording_id,
            thread_recording_path,
            thread_stop_signal,
            init_tx,
        )
    });

    match init_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            let _ = worker.join();
            fs::remove_file(&recording_path).ok();
            return Err(error);
        }
        Err(_) => {
            let _ = worker.join();
            fs::remove_file(&recording_path).ok();
            return Err(AudioError::StartRecordingFailed);
        }
    }

    *session_guard = Some(RecordingSession {
        id: recording_id.clone(),
        output_path: recording_path,
        stop_signal,
        worker: Some(worker),
    });

    Ok(recording_id)
}

fn stop_recording_impl(
    _app: &AppHandle,
    database: &AppDatabase,
    state: &RecordingState,
    recording_id: String,
) -> Result<AudioFileMetadata, AudioError> {
    let mut session_guard = state
        .session
        .lock()
        .map_err(|_| AudioError::StateLockFailed)?;
    let Some(mut session) = session_guard.take() else {
        return Err(AudioError::NoActiveRecording);
    };

    if session.id != recording_id {
        *session_guard = Some(session);
        return Err(AudioError::RecordingIdMismatch);
    }

    session.stop_signal.store(true, Ordering::SeqCst);
    let worker = session
        .worker
        .take()
        .ok_or(AudioError::FinalizeRecordingFailed)?;
    let output_path = session.output_path.clone();
    drop(session_guard);

    match worker.join() {
        Ok(Ok(())) => {}
        Ok(Err(error)) => {
            fs::remove_file(&output_path).ok();
            return Err(error);
        }
        Err(_) => {
            fs::remove_file(&output_path).ok();
            return Err(AudioError::FinalizeRecordingFailed);
        }
    }

    if !output_path.exists() {
        return Err(AudioError::FileNotFound);
    }

    let metadata = build_audio_metadata(
        recording_id.clone(),
        format!("{recording_id}.wav"),
        &output_path,
        SourceType::Audio,
    )?;
    persist_lecture_metadata(database, &metadata)?;
    Ok(metadata)
}

fn run_recording_worker(
    app: AppHandle,
    recording_id: String,
    recording_path: PathBuf,
    stop_signal: Arc<AtomicBool>,
    init_tx: mpsc::Sender<Result<(), AudioError>>,
) -> Result<(), AudioError> {
    let host = cpal::default_host();
    let input_device = host
        .default_input_device()
        .ok_or(AudioError::InputDeviceUnavailable)?;
    let supported_config = input_device
        .default_input_config()
        .map_err(|_| AudioError::InputConfigUnavailable)?;

    let wav_spec = hound::WavSpec {
        channels: supported_config.channels(),
        sample_rate: supported_config.sample_rate().0,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer =
        hound::WavWriter::create(&recording_path, wav_spec).map_err(|_| AudioError::SaveFailed)?;
    let writer = Arc::new(Mutex::new(Some(writer)));
    let level_signal = Arc::new(AtomicU32::new(0));
    let stream_config: cpal::StreamConfig = supported_config.clone().into();

    let stream_result = match supported_config.sample_format() {
        cpal::SampleFormat::F32 => build_f32_stream(
            &input_device,
            &stream_config,
            Arc::clone(&writer),
            Arc::clone(&level_signal),
        ),
        cpal::SampleFormat::I16 => build_i16_stream(
            &input_device,
            &stream_config,
            Arc::clone(&writer),
            Arc::clone(&level_signal),
        ),
        cpal::SampleFormat::U16 => build_u16_stream(
            &input_device,
            &stream_config,
            Arc::clone(&writer),
            Arc::clone(&level_signal),
        ),
        _ => Err(AudioError::InputConfigUnavailable),
    };
    let stream = match stream_result {
        Ok(stream) => stream,
        Err(error) => {
            cleanup_writer(&writer);
            fs::remove_file(&recording_path).ok();
            let _ = init_tx.send(Err(error.clone()));
            return Err(error);
        }
    };

    if stream.play().is_err() {
        cleanup_writer(&writer);
        fs::remove_file(&recording_path).ok();
        let _ = init_tx.send(Err(AudioError::StartRecordingFailed));
        return Err(AudioError::StartRecordingFailed);
    }

    let _ = init_tx.send(Ok(()));

    while !stop_signal.load(Ordering::SeqCst) {
        let level = level_signal.swap(0, Ordering::Relaxed).min(100) as u8;
        let _ = app.emit(
            "recording-level",
            RecordingLevelEvent {
                recording_id: recording_id.clone(),
                level,
            },
        );
        thread::sleep(Duration::from_millis(100));
    }

    let _ = app.emit(
        "recording-level",
        RecordingLevelEvent {
            recording_id,
            level: 0,
        },
    );

    drop(stream);

    let mut writer_guard = writer.lock().map_err(|_| AudioError::StateLockFailed)?;
    let Some(writer) = writer_guard.take() else {
        return Err(AudioError::FinalizeRecordingFailed);
    };
    writer
        .finalize()
        .map_err(|_| AudioError::FinalizeRecordingFailed)
}

fn build_f32_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    level_signal: Arc<AtomicU32>,
) -> Result<cpal::Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[f32], _| {
                let mut peak = 0.0_f32;
                if let Ok(mut writer_guard) = writer.lock() {
                    if let Some(wav_writer) = writer_guard.as_mut() {
                        for sample in data {
                            let sample_i16 = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                            if wav_writer.write_sample(sample_i16).is_err() {
                                break;
                            }
                            let amplitude = sample.abs();
                            if amplitude > peak {
                                peak = amplitude;
                            }
                        }
                    }
                }
                level_signal.store((peak.clamp(0.0, 1.0) * 100.0) as u32, Ordering::Relaxed);
            },
            move |_error| {},
            None,
        )
        .map_err(|_| AudioError::StartRecordingFailed)
}

fn build_i16_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    level_signal: Arc<AtomicU32>,
) -> Result<cpal::Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[i16], _| {
                let mut peak = 0_i32;
                if let Ok(mut writer_guard) = writer.lock() {
                    if let Some(wav_writer) = writer_guard.as_mut() {
                        for sample in data {
                            if wav_writer.write_sample(*sample).is_err() {
                                break;
                            }
                            let amplitude = (*sample as i32).abs();
                            if amplitude > peak {
                                peak = amplitude;
                            }
                        }
                    }
                }
                level_signal.store(
                    ((peak as f32 / i16::MAX as f32).clamp(0.0, 1.0) * 100.0) as u32,
                    Ordering::Relaxed,
                );
            },
            move |_error| {},
            None,
        )
        .map_err(|_| AudioError::StartRecordingFailed)
}

fn build_u16_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    writer: Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>,
    level_signal: Arc<AtomicU32>,
) -> Result<cpal::Stream, AudioError> {
    device
        .build_input_stream(
            config,
            move |data: &[u16], _| {
                let mut peak = 0.0_f32;
                if let Ok(mut writer_guard) = writer.lock() {
                    if let Some(wav_writer) = writer_guard.as_mut() {
                        for sample in data {
                            let sample_i16 = (*sample as i32 - 32_768) as i16;
                            if wav_writer.write_sample(sample_i16).is_err() {
                                break;
                            }
                            let normalized = (sample_i16 as f32 / i16::MAX as f32).abs();
                            if normalized > peak {
                                peak = normalized;
                            }
                        }
                    }
                }
                level_signal.store((peak.clamp(0.0, 1.0) * 100.0) as u32, Ordering::Relaxed);
            },
            move |_error| {},
            None,
        )
        .map_err(|_| AudioError::StartRecordingFailed)
}

fn cleanup_writer(writer: &Arc<Mutex<Option<hound::WavWriter<BufWriter<File>>>>>) {
    if let Ok(mut writer_guard) = writer.lock() {
        if let Some(active_writer) = writer_guard.take() {
            let _ = active_writer.finalize();
        }
    }
}

fn build_audio_metadata(
    id: String,
    filename: String,
    file_path: &Path,
    source_type: SourceType,
) -> Result<AudioFileMetadata, AudioError> {
    let file_metadata = fs::metadata(file_path).map_err(|_| AudioError::MetadataReadFailed)?;
    let duration_seconds = extract_duration_seconds(file_path)?;

    Ok(AudioFileMetadata {
        id,
        filename,
        path: file_path.to_string_lossy().to_string(),
        duration_seconds,
        size_bytes: file_metadata.len(),
        source_type: source_type.as_str().to_string(),
    })
}

fn extract_duration_seconds(file_path: &Path) -> Result<f64, AudioError> {
    let file = File::open(file_path).map_err(|_| AudioError::MetadataReadFailed)?;
    let mut hint = Hint::new();
    if let Some(extension) = file_path.extension().and_then(|ext| ext.to_str()) {
        hint.with_extension(extension);
    }

    let source = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());
    let mut probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|_| AudioError::MetadataReadFailed)?;
    let format = &mut probed.format;

    let track = get_audio_track(format.tracks())
        .or_else(|| format.default_track())
        .ok_or(AudioError::MissingAudioTrack)?;

    let track_id = track.id;
    let n_frames = track.codec_params.n_frames;
    let sample_rate = track.codec_params.sample_rate;
    let time_base = track.codec_params.time_base;

    if let Some(frames) = n_frames {
        if let Some(base) = time_base {
            let time = base.calc_time(frames);
            return Ok(time.seconds as f64 + time.frac);
        }
        if let Some(rate) = sample_rate {
            return Ok(frames as f64 / rate as f64);
        }
    }

    let Some(base) = time_base else {
        return Err(AudioError::MetadataReadFailed);
    };

    let mut max_ts = 0_u64;
    loop {
        match format.next_packet() {
            Ok(packet) => {
                if packet.track_id() == track_id {
                    let packet_end = packet.ts().saturating_add(packet.dur());
                    if packet_end > max_ts {
                        max_ts = packet_end;
                    }
                }
            }
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::ResetRequired) => continue,
            Err(_) => break,
        }
    }

    if max_ts == 0 {
        return Ok(0.0);
    }

    let time = base.calc_time(max_ts);
    Ok(time.seconds as f64 + time.frac)
}

fn get_audio_track(tracks: &[Track]) -> Option<&Track> {
    tracks.iter().find(|track| {
        track.codec_params.sample_rate.is_some() || track.codec_params.channels.is_some()
    })
}

fn get_lectures_dir(app: &AppHandle) -> Result<PathBuf, AudioError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AudioError::AppDataDirUnavailable)?;
    let lectures_dir = app_data_dir.join("lectures");
    fs::create_dir_all(&lectures_dir).map_err(|_| AudioError::AppDataDirUnavailable)?;
    Ok(lectures_dir)
}

fn get_extension_and_source_type(path: &Path) -> Result<(String, SourceType), AudioError> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| AudioError::UnsupportedExtension("none".to_string()))?;

    if SUPPORTED_AUDIO_EXTENSIONS.contains(&extension.as_str()) {
        return Ok((extension, SourceType::Audio));
    }

    if SUPPORTED_VIDEO_EXTENSIONS.contains(&extension.as_str()) {
        return Ok((extension, SourceType::Video));
    }

    Err(AudioError::UnsupportedExtension(extension))
}

fn extract_video_audio(
    app: &AppHandle,
    source_path: &Path,
    target_path: &Path,
) -> Result<(), AudioError> {
    let temp_output = target_path.with_extension("tmp.wav");
    let ffmpeg_path = resolve_ffmpeg_path(Some(app));
    let ffmpeg_output = Command::new(ffmpeg_path)
        .arg("-y")
        .arg("-hide_banner")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(source_path.as_os_str())
        .arg("-vn")
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-f")
        .arg("wav")
        .arg(temp_output.as_os_str())
        .output();

    match ffmpeg_output {
        Ok(output) if output.status.success() => {
            fs::rename(&temp_output, target_path).map_err(|_| {
                fs::remove_file(&temp_output).ok();
                AudioError::SaveFailed
            })?;
            Ok(())
        }
        Ok(output) => {
            fs::remove_file(&temp_output).ok();
            Err(map_ffmpeg_failure(&String::from_utf8_lossy(&output.stderr)))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::remove_file(&temp_output).ok();
            Err(AudioError::FfmpegMissing)
        }
        Err(_) => {
            fs::remove_file(&temp_output).ok();
            Err(AudioError::VideoExtractionFailed)
        }
    }
}

fn map_ffmpeg_failure(stderr: &str) -> AudioError {
    let normalized = stderr.to_ascii_lowercase();

    if normalized.contains("does not contain any stream")
        || normalized.contains("stream map 'a' matches no streams")
        || normalized.contains("output file #0 does not contain any stream")
    {
        return AudioError::MissingAudioTrack;
    }

    if normalized.contains("unsupported")
        || normalized.contains("invalid data")
        || normalized.contains("could not find codec parameters")
        || normalized.contains("unknown decoder")
    {
        return AudioError::UnsupportedVideoCodec;
    }

    AudioError::VideoExtractionFailed
}

fn ensure_available_space(directory: &Path, required_bytes: u64) -> Result<(), AudioError> {
    let free_space = available_space(directory).map_err(|_| AudioError::DiskSpaceCheckFailed)?;
    if free_space < required_bytes {
        return Err(AudioError::DiskSpaceInsufficient);
    }
    Ok(())
}

fn persist_lecture_metadata(
    database: &AppDatabase,
    metadata: &AudioFileMetadata,
) -> Result<(), AudioError> {
    let connection = database.connect().map_err(|_| AudioError::DatabaseFailed)?;

    let lecture = LectureRecord {
        id: metadata.id.clone(),
        filename: metadata.filename.clone(),
        audio_path: metadata.path.clone(),
        source_type: metadata.source_type.clone(),
        duration: metadata.duration_seconds,
        status: "uploaded".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };

    upsert_lecture(&connection, &lecture).map_err(|_| AudioError::DatabaseFailed)
}
