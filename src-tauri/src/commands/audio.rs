use crate::db::queries::{upsert_lecture, LectureRecord};
use crate::db::AppDatabase;
use chrono::Utc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::fs::{self, File};
use std::io::BufWriter;
use std::path::{Path, PathBuf};
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

const SUPPORTED_EXTENSIONS: [&str; 6] = ["mp3", "wav", "m4a", "ogg", "webm", "mp4"];

#[derive(Debug, Clone, Serialize)]
pub struct AudioFileMetadata {
    pub id: String,
    pub filename: String,
    pub path: String,
    pub duration_seconds: f64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
struct RecordingLevelEvent {
    recording_id: String,
    level: u8,
}

#[derive(Debug, Clone, Error)]
enum AudioError {
    #[error("The selected file does not exist.")]
    FileNotFound,
    #[error("The selected path is not a file.")]
    NotAFile,
    #[error(
        "Unsupported file extension: {0}. Supported formats are mp3, wav, m4a, ogg, webm, mp4."
    )]
    UnsupportedExtension(String),
    #[error("Unable to access the app data directory.")]
    AppDataDirUnavailable,
    #[error("Failed to save the audio file.")]
    SaveFailed,
    #[error("Unable to read audio metadata.")]
    MetadataReadFailed,
    #[error("No audio track was found in the selected file.")]
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
pub fn accept_audio_file(
    app: AppHandle,
    database: State<'_, AppDatabase>,
    path: String,
) -> Result<AudioFileMetadata, String> {
    accept_audio_file_impl(&app, database.inner(), &path).map_err(Into::into)
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

    let extension = get_extension(&source_path)?;
    let id = Uuid::new_v4().to_string();
    let lectures_dir = get_lectures_dir(app)?;
    let destination_path = lectures_dir.join(format!("{id}.{extension}"));

    fs::copy(&source_path, &destination_path).map_err(|_| AudioError::SaveFailed)?;

    let filename = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{id}.{extension}"));

    let metadata = build_audio_metadata(id, filename, &destination_path)?;
    persist_lecture_metadata(database, &metadata)?;
    Ok(metadata)
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
) -> Result<AudioFileMetadata, AudioError> {
    let file_metadata = fs::metadata(file_path).map_err(|_| AudioError::MetadataReadFailed)?;
    let duration_seconds = extract_duration_seconds(file_path)?;

    Ok(AudioFileMetadata {
        id,
        filename,
        path: file_path.to_string_lossy().to_string(),
        duration_seconds,
        size_bytes: file_metadata.len(),
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

fn get_extension(path: &Path) -> Result<String, AudioError> {
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .ok_or_else(|| AudioError::UnsupportedExtension("none".to_string()))?;

    if SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
        Ok(extension)
    } else {
        Err(AudioError::UnsupportedExtension(extension))
    }
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
        duration: metadata.duration_seconds,
        status: "uploaded".to_string(),
        created_at: Utc::now().to_rfc3339(),
    };

    upsert_lecture(&connection, &lecture).map_err(|_| AudioError::DatabaseFailed)
}
