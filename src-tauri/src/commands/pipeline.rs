use crate::db::{
    queries::count_llm_stage_cache, queries::get_pipeline_stages, queries::PipelineStageRecord,
    AppDatabase,
};
use crate::pipeline::orchestrator::{run_full_pipeline_with_options, PipelineRunOptions};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use tauri::{AppHandle, Manager};

/// Start the full processing pipeline for a lecture.
///
/// This command returns immediately — the pipeline runs in a background tokio task
/// and communicates progress via `pipeline-stage` Tauri events.
#[tauri::command]
pub async fn start_pipeline(
    app: AppHandle,
    lecture_id: String,
    use_cache: Option<bool>,
) -> Result<(), String> {
    start_pipeline_impl(app, lecture_id, use_cache).await
}

#[derive(Debug, serde::Serialize)]
pub struct PipelineEstimate {
    pub lecture_id: String,
    pub transcript_words: usize,
    pub token_estimate: usize,
    pub estimated_minutes_min: u32,
    pub estimated_minutes_max: u32,
    pub has_cached_results: bool,
    pub cached_stage_count: i64,
    pub is_long_transcript: bool,
}

#[tauri::command]
pub async fn estimate_pipeline_work(
    app: AppHandle,
    lecture_id: String,
) -> Result<PipelineEstimate, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;

    let transcript = crate::db::queries::get_transcript_by_lecture_id(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No transcript found for this lecture.".to_string())?;

    let transcript_words = transcript.full_text.split_whitespace().count();
    let token_estimate = ((transcript.full_text.chars().count() as f64) / 4.0).ceil() as usize;
    let estimated_minutes_min = ((token_estimate as f64) / 3200.0).ceil().max(1.0) as u32;
    let estimated_minutes_max = ((token_estimate as f64) / 1300.0).ceil().max(2.0) as u32;

    let transcript_hash = transcript_hash(&transcript.full_text);
    let cached_stage_count = count_llm_stage_cache(&conn, &lecture_id, &transcript_hash)
        .map_err(|e| e.to_string())?;

    Ok(PipelineEstimate {
        lecture_id,
        transcript_words,
        token_estimate,
        estimated_minutes_min,
        estimated_minutes_max,
        has_cached_results: cached_stage_count > 0,
        cached_stage_count,
        is_long_transcript: transcript_words > 10_000,
    })
}

async fn start_pipeline_impl(
    app: AppHandle,
    lecture_id: String,
    use_cache: Option<bool>,
) -> Result<(), String> {
    // Verify the database is available before spawning
    let _db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let app_clone = app.clone();
    let lecture_id_clone = lecture_id.clone();
    let options = PipelineRunOptions {
        use_cache: use_cache.unwrap_or(true),
    };

    // Spawn as a detached background task so the command returns immediately
    tokio::spawn(async move {
        run_full_pipeline_with_options(lecture_id_clone, app_clone, options).await;
    });

    Ok(())
}

fn transcript_hash(transcript: &str) -> String {
    let mut hasher = DefaultHasher::new();
    transcript.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Return the current pipeline stage statuses for a lecture.
///
/// Useful for restoring the UI state if the user navigates away and returns.
#[tauri::command]
pub async fn get_pipeline_status(
    app: AppHandle,
    lecture_id: String,
) -> Result<Vec<PipelineStageRecord>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let connection = db.connect().map_err(|e| e.to_string())?;
    get_pipeline_stages(&connection, &lecture_id).map_err(|e| e.to_string())
}

/// Retrieve structured notes JSON for a lecture.
#[tauri::command]
pub async fn get_notes(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::get_notes(&conn, &lecture_id).map_err(|e| e.to_string())
}

/// Retrieve quiz JSON for a lecture.
#[tauri::command]
pub async fn get_quiz(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::get_quiz(&conn, &lecture_id).map_err(|e| e.to_string())
}

/// Retrieve flashcards JSON for a lecture.
#[tauri::command]
pub async fn get_flashcards(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::get_flashcards(&conn, &lecture_id).map_err(|e| e.to_string())
}

/// Retrieve mind-map JSON for a lecture.
#[tauri::command]
pub async fn get_mindmap(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;
    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::get_mindmap(&conn, &lecture_id).map_err(|e| e.to_string())
}

// ─── Notes Helpers ────────────────────────────────────────────────────────────

/// Minimal structs used only for Markdown serialisation (deserialized from the
/// stored notes JSON).
#[derive(serde::Deserialize, Default)]
struct NotesTopic {
    heading: String,
    #[serde(default)]
    key_points: Vec<String>,
    #[serde(default)]
    details: String,
    #[serde(default)]
    examples: Vec<String>,
}

#[derive(serde::Deserialize)]
struct NotesTerm {
    term: String,
    definition: String,
}

#[derive(serde::Deserialize, Default)]
struct StructuredNotesData {
    #[serde(default)]
    title: String,
    #[serde(default)]
    topics: Vec<NotesTopic>,
    #[serde(default)]
    key_terms: Vec<NotesTerm>,
    #[serde(default)]
    takeaways: Vec<String>,
}

fn notes_to_markdown(notes: &StructuredNotesData) -> String {
    let mut md = String::new();
    md.push_str(&format!("# {}\n\n", notes.title));

    for topic in &notes.topics {
        md.push_str(&format!("## {}\n\n", topic.heading));

        if !topic.key_points.is_empty() {
            md.push_str("### Key Points\n\n");
            for p in &topic.key_points {
                md.push_str(&format!("- {}\n", p));
            }
            md.push('\n');
        }

        if !topic.details.is_empty() {
            md.push_str(&format!("{}\n\n", topic.details));
        }

        if !topic.examples.is_empty() {
            md.push_str("### Examples\n\n");
            for ex in &topic.examples {
                md.push_str(&format!("> {}\n\n", ex));
            }
        }
    }

    if !notes.key_terms.is_empty() {
        md.push_str("## Key Terms\n\n");
        md.push_str("| Term | Definition |\n");
        md.push_str("|------|------------|\n");
        for item in &notes.key_terms {
            md.push_str(&format!("| **{}** | {} |\n", item.term, item.definition));
        }
        md.push('\n');
    }

    if !notes.takeaways.is_empty() {
        md.push_str("## Key Takeaways\n\n");
        for (i, t) in notes.takeaways.iter().enumerate() {
            md.push_str(&format!("{}. {}\n", i + 1, t));
        }
        md.push('\n');
    }

    md
}

// ─── Regenerate Notes ─────────────────────────────────────────────────────────

/// Re-run the structured notes stage for a lecture using the current LLM
/// settings.  Returns the new notes JSON (or an error string).
#[tauri::command]
pub async fn regenerate_notes(
    app: AppHandle,
    lecture_id: String,
) -> Result<Option<String>, String> {
    use crate::commands::llm::{parse_json_from_response, OllamaClient};
    use crate::utils::prompt_templates;

    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    // ── Load transcript ──────────────────────────────────────────────────────
    let conn = db.connect().map_err(|e| e.to_string())?;
    let transcript_rec = crate::db::queries::get_transcript_by_lecture_id(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No transcript found for this lecture.".to_string())?;

    let summary = crate::db::queries::get_lecture_summary(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    drop(conn);

    // ── Load settings ────────────────────────────────────────────────────────
    let settings =
        crate::commands::settings::get_settings(app.clone()).map_err(|e| e.to_string())?;

    let model = settings.llm_model.clone();
    let level = settings.personalization_level.clone();

    // ── Build context (mirrors orchestrator logic) ───────────────────────────
    const CHUNK_CHARS: usize = 16_000;
    let context_text = if transcript_rec.full_text.len() > CHUNK_CHARS {
        format!(
            "LECTURE SUMMARY:\n{summary}\n\nFIRST SECTION OF TRANSCRIPT:\n{}\n\
             (Note: this is a long lecture; the above is a representative excerpt.)",
            &transcript_rec.full_text[..CHUNK_CHARS]
        )
    } else {
        transcript_rec.full_text.clone()
    };

    let client = OllamaClient::new(settings.ollama_url.clone(), settings.llm_timeout_seconds);
    let prompt = prompt_templates::structured_notes_prompt(&context_text, &level);

    // ── Call LLM ─────────────────────────────────────────────────────────────
    let raw = client
        .generate(&app, &model, &prompt, &lecture_id, "notes")
        .await
        .map_err(|e| e.to_string())?;

    let extracted = parse_json_from_response(&raw);

    // Validate JSON, retry once on failure
    let json = if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        extracted
    } else {
        let retry_prompt = format!(
            "{}\n\nIMPORTANT: Output ONLY valid JSON with no additional text or markdown fences.",
            prompt
        );
        let retry_raw = client
            .generate(&app, &model, &retry_prompt, &lecture_id, "notes_retry")
            .await
            .map_err(|e| e.to_string())?;
        let retry_extracted = parse_json_from_response(&retry_raw);
        if serde_json::from_str::<serde_json::Value>(&retry_extracted).is_ok() {
            retry_extracted
        } else {
            return Err("LLM did not return valid JSON after retry.".to_string());
        }
    };

    // ── Persist ──────────────────────────────────────────────────────────────
    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::upsert_notes(&conn, &lecture_id, &json).map_err(|e| e.to_string())?;

    Ok(Some(json))
}

// ─── Export Notes as Markdown ─────────────────────────────────────────────────

/// Read the stored notes JSON for a lecture, convert to Markdown, open a
/// native save-file dialog, and write the file.
///
/// Returns the chosen file path, or `None` if the user cancelled the dialog.
#[tauri::command]
pub fn export_notes_markdown(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let conn = db.connect().map_err(|e| e.to_string())?;
    let notes_json = crate::db::queries::get_notes(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No notes found for this lecture.".to_string())?;
    drop(conn);

    let notes: StructuredNotesData =
        serde_json::from_str(&notes_json).map_err(|e| format!("Failed to parse notes: {e}"))?;

    let markdown = notes_to_markdown(&notes);

    // Open native save-file dialog
    let default_name = format!("{}-notes.md", notes.title.replace(' ', "-"));
    let path = rfd::FileDialog::new()
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .save_file();

    let Some(path) = path else {
        return Ok(None); // User cancelled
    };

    std::fs::write(&path, markdown.as_bytes()).map_err(|e| format!("Failed to write file: {e}"))?;

    Ok(Some(path.to_string_lossy().to_string()))
}

// ─── Regenerate Quiz ──────────────────────────────────────────────────────────

/// Re-run the quiz generation stage for a lecture using the current LLM
/// settings.  Returns the new quiz JSON (or an error string).
#[tauri::command]
pub async fn regenerate_quiz(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    use crate::commands::llm::{parse_json_from_response, OllamaClient};
    use crate::utils::prompt_templates;

    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    // ── Load transcript ──────────────────────────────────────────────────────
    let conn = db.connect().map_err(|e| e.to_string())?;
    let transcript_rec = crate::db::queries::get_transcript_by_lecture_id(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No transcript found for this lecture.".to_string())?;
    drop(conn);

    // ── Load settings ────────────────────────────────────────────────────────
    let settings =
        crate::commands::settings::get_settings(app.clone()).map_err(|e| e.to_string())?;

    let model = settings.llm_model.clone();
    let level = settings.personalization_level.clone();

    // ── Truncate transcript if needed (mirrors orchestrator logic) ───────────
    const CHUNK_CHARS: usize = 16_000;
    let context_text = if transcript_rec.full_text.len() > CHUNK_CHARS {
        transcript_rec.full_text[..CHUNK_CHARS].to_string()
    } else {
        transcript_rec.full_text.clone()
    };

    let client = OllamaClient::new(settings.ollama_url.clone(), settings.llm_timeout_seconds);
    let prompt = prompt_templates::quiz_prompt(&context_text, &level);

    // ── Call LLM ─────────────────────────────────────────────────────────────
    let raw = client
        .generate(&app, &model, &prompt, &lecture_id, "quiz")
        .await
        .map_err(|e| e.to_string())?;

    let extracted = parse_json_from_response(&raw);

    // Validate JSON, retry once on failure
    let json = if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        extracted
    } else {
        let retry_prompt = format!(
            "{}\n\nIMPORTANT: Output ONLY valid JSON with no additional text or markdown fences.",
            prompt
        );
        let retry_raw = client
            .generate(&app, &model, &retry_prompt, &lecture_id, "quiz_retry")
            .await
            .map_err(|e| e.to_string())?;
        let retry_extracted = parse_json_from_response(&retry_raw);
        if serde_json::from_str::<serde_json::Value>(&retry_extracted).is_ok() {
            retry_extracted
        } else {
            return Err("LLM did not return valid JSON after retry.".to_string());
        }
    };

    // ── Persist ──────────────────────────────────────────────────────────────
    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::upsert_quiz(&conn, &lecture_id, &json).map_err(|e| e.to_string())?;

    Ok(Some(json))
}

// ─── Regenerate Mind Map ──────────────────────────────────────────────────────

/// Re-run the mind-map generation stage for a lecture using the current LLM
/// settings.  Returns the new mind-map JSON (or an error string).
#[tauri::command]
pub async fn regenerate_mindmap(
    app: AppHandle,
    lecture_id: String,
) -> Result<Option<String>, String> {
    use crate::commands::llm::{parse_json_from_response, OllamaClient};
    use crate::utils::prompt_templates;

    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let conn = db.connect().map_err(|e| e.to_string())?;
    let transcript_rec = crate::db::queries::get_transcript_by_lecture_id(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No transcript found for this lecture.".to_string())?;
    drop(conn);

    let settings =
        crate::commands::settings::get_settings(app.clone()).map_err(|e| e.to_string())?;

    let model = settings.llm_model.clone();
    let level = settings.personalization_level.clone();

    const CHUNK_CHARS: usize = 16_000;
    let context_text = if transcript_rec.full_text.len() > CHUNK_CHARS {
        transcript_rec.full_text[..CHUNK_CHARS].to_string()
    } else {
        transcript_rec.full_text.clone()
    };

    let client = OllamaClient::new(settings.ollama_url.clone(), settings.llm_timeout_seconds);
    let prompt = prompt_templates::mindmap_prompt(&context_text, &level);

    let raw = client
        .generate(&app, &model, &prompt, &lecture_id, "mindmap")
        .await
        .map_err(|e| e.to_string())?;

    let extracted = parse_json_from_response(&raw);

    let json = if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        extracted
    } else {
        let retry_prompt = format!(
            "{}\n\nIMPORTANT: Output ONLY valid JSON with no additional text or markdown fences.",
            prompt
        );
        let retry_raw = client
            .generate(&app, &model, &retry_prompt, &lecture_id, "mindmap_retry")
            .await
            .map_err(|e| e.to_string())?;
        let retry_extracted = parse_json_from_response(&retry_raw);
        if serde_json::from_str::<serde_json::Value>(&retry_extracted).is_ok() {
            retry_extracted
        } else {
            return Err("LLM did not return valid JSON after retry.".to_string());
        }
    };

    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::upsert_mindmap(&conn, &lecture_id, &json).map_err(|e| e.to_string())?;

    Ok(Some(json))
}

// ─── Save Quiz Attempt ────────────────────────────────────────────────────────

/// Save a quiz attempt (user answers + score) to the database.
/// Returns the id of the created record.
#[tauri::command]
pub async fn save_quiz_attempt(
    app: AppHandle,
    lecture_id: String,
    answers_json: String,
    score: i64,
    total_questions: i64,
) -> Result<String, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let conn = db.connect().map_err(|e| e.to_string())?;
    crate::db::queries::insert_quiz_attempt(
        &conn,
        &lecture_id,
        &answers_json,
        score,
        total_questions,
    )
    .map_err(|e| e.to_string())
}

// ─── Flashcard Export ─────────────────────────────────────────────────────────

/// Read stored flashcards for a lecture, open a native save-file dialog,
/// and write an Anki .apkg file.  Returns the path or null if cancelled.
#[tauri::command]
pub fn export_flashcards_anki(
    app: AppHandle,
    lecture_id: String,
) -> Result<Option<String>, String> {
    use crate::utils::anki_export;

    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let conn = db.connect().map_err(|e| e.to_string())?;
    let flashcards_json = crate::db::queries::get_flashcards(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No flashcards found for this lecture.".to_string())?;

    // Also look up lecture filename for the deck name
    let lecture =
        crate::db::queries::get_lecture_by_id(&conn, &lecture_id).map_err(|e| e.to_string())?;
    drop(conn);

    let deck_name = match &lecture {
        Some(l) => {
            let stem = std::path::Path::new(&l.filename)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| l.filename.clone());
            format!("LectureToLearn::{stem}")
        }
        None => "LectureToLearn::Untitled".to_string(),
    };

    let cards = anki_export::parse_flashcards(&flashcards_json)?;

    // Open native save dialog
    let path = rfd::FileDialog::new()
        .set_file_name("flashcards.apkg")
        .add_filter("Anki Package", &["apkg"])
        .save_file();

    let Some(path) = path else {
        return Ok(None); // User cancelled
    };

    let path_str = path.to_string_lossy().to_string();
    anki_export::export_as_apkg(&cards, &deck_name, &path_str)?;

    Ok(Some(path_str))
}

/// Read stored flashcards for a lecture, open a native save-file dialog,
/// and write a tab-separated .txt file for Anki import.  Returns path or null.
#[tauri::command]
pub fn export_flashcards_tsv(app: AppHandle, lecture_id: String) -> Result<Option<String>, String> {
    use crate::utils::anki_export;

    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let conn = db.connect().map_err(|e| e.to_string())?;
    let flashcards_json = crate::db::queries::get_flashcards(&conn, &lecture_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No flashcards found for this lecture.".to_string())?;

    let lecture =
        crate::db::queries::get_lecture_by_id(&conn, &lecture_id).map_err(|e| e.to_string())?;
    drop(conn);

    let deck_name = match &lecture {
        Some(l) => {
            let stem = std::path::Path::new(&l.filename)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| l.filename.clone());
            format!("LectureToLearn::{stem}")
        }
        None => "LectureToLearn::Untitled".to_string(),
    };

    let cards = anki_export::parse_flashcards(&flashcards_json)?;

    let path = rfd::FileDialog::new()
        .set_file_name("flashcards.txt")
        .add_filter("Text (Tab-Separated)", &["txt"])
        .save_file();

    let Some(path) = path else {
        return Ok(None);
    };

    let path_str = path.to_string_lossy().to_string();
    anki_export::export_as_tsv(&cards, &deck_name, &path_str)?;

    Ok(Some(path_str))
}
