use crate::commands::llm::{parse_json_from_response, OllamaClient};
use crate::commands::settings::get_settings;
use crate::db::{queries, AppDatabase};
use crate::utils::prompt_templates;
use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

// ─── Event Types ──────────────────────────────────────────────────────────────

/// Emitted as `pipeline-stage` Tauri event at the start/end of each stage.
#[derive(Debug, Clone, Serialize)]
pub struct PipelineStageEvent {
    pub lecture_id: String,
    pub stage: String,
    /// "starting" | "complete" | "error"
    pub status: String,
    /// Short excerpt of the result for preview
    pub preview: Option<String>,
    pub error: Option<String>,
    /// 0–6 (0 = not started, 6 = all done)
    pub stages_complete: u32,
}

// ─── Constants ────────────────────────────────────────────────────────────────

/// Approximate chars per token; used for chunking long transcripts.
const CHARS_PER_TOKEN: usize = 4;
/// Maximum tokens per chunk sent to the LLM.
const CHUNK_TOKENS: usize = 4000;
const CHUNK_CHARS: usize = CHUNK_TOKENS * CHARS_PER_TOKEN; // 16 000

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Split `text` into chunks of at most `CHUNK_CHARS` characters, preferring
/// to break on whitespace boundaries.
fn chunk_transcript(text: &str) -> Vec<String> {
    if text.len() <= CHUNK_CHARS {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < text.len() {
        let end = (start + CHUNK_CHARS).min(text.len());

        // Try to break on whitespace so we don't split mid-word.
        let split_at = if end < text.len() {
            text[start..end]
                .rfind(char::is_whitespace)
                .map(|idx| start + idx)
                .unwrap_or(end)
        } else {
            end
        };

        chunks.push(text[start..split_at].to_string());
        start = split_at + 1; // skip the whitespace char
    }

    chunks
}

/// Build a short preview from an LLM response (first 200 chars).
fn make_preview(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.len() > 200 {
        format!("{}…", &trimmed[..200])
    } else {
        trimmed.to_string()
    }
}

// ─── Stage executor ───────────────────────────────────────────────────────────

/// Execute a single LLM stage.  
/// Returns `(llm_output_string, is_json_valid)`.
async fn run_stage(
    client: &OllamaClient,
    app: &AppHandle,
    model: &str,
    prompt: &str,
    lecture_id: &str,
    stage: &str,
    expect_json: bool,
) -> Result<String, String> {
    let raw = client
        .generate(app, model, prompt, lecture_id, stage)
        .await
        .map_err(|e| e.to_string())?;

    if !expect_json {
        return Ok(raw);
    }

    let extracted = parse_json_from_response(&raw);

    if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        return Ok(extracted);
    }

    // Retry once with an explicit JSON directive
    let retry_prompt = format!(
        "{}\n\nIMPORTANT: Output ONLY valid JSON with no additional text or markdown fences.",
        prompt
    );
    let retry_raw = client
        .generate(app, model, &retry_prompt, lecture_id, stage)
        .await
        .map_err(|e| e.to_string())?;

    let retry_extracted = parse_json_from_response(&retry_raw);

    if serde_json::from_str::<serde_json::Value>(&retry_extracted).is_ok() {
        Ok(retry_extracted)
    } else {
        Err("LLM did not return valid JSON after retry.".to_string())
    }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

fn mark_stage_starting(db: &AppDatabase, lecture_id: &str, stage_name: &str) {
    if let Ok(conn) = db.connect() {
        let record = queries::PipelineStageRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.to_string(),
            stage_name: stage_name.to_string(),
            status: "running".to_string(),
            result_preview: None,
            error: None,
            started_at: Some(Utc::now().to_rfc3339()),
            completed_at: None,
        };
        let _ = queries::upsert_pipeline_stage(&conn, &record);
    }
}

fn mark_stage_complete(db: &AppDatabase, lecture_id: &str, stage_name: &str, preview: &str) {
    if let Ok(conn) = db.connect() {
        let record = queries::PipelineStageRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.to_string(),
            stage_name: stage_name.to_string(),
            status: "complete".to_string(),
            result_preview: Some(preview.to_string()),
            error: None,
            started_at: None,
            completed_at: Some(Utc::now().to_rfc3339()),
        };
        let _ = queries::upsert_pipeline_stage(&conn, &record);
    }
}

fn mark_stage_error(db: &AppDatabase, lecture_id: &str, stage_name: &str, error: &str) {
    if let Ok(conn) = db.connect() {
        let record = queries::PipelineStageRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.to_string(),
            stage_name: stage_name.to_string(),
            status: "error".to_string(),
            result_preview: None,
            error: Some(error.to_string()),
            started_at: None,
            completed_at: Some(Utc::now().to_rfc3339()),
        };
        let _ = queries::upsert_pipeline_stage(&conn, &record);
    }
}

fn emit_stage(
    app: &AppHandle,
    lecture_id: &str,
    stage: &str,
    status: &str,
    preview: Option<String>,
    error: Option<String>,
    stages_complete: u32,
) {
    let _ = app.emit(
        "pipeline-stage",
        PipelineStageEvent {
            lecture_id: lecture_id.to_string(),
            stage: stage.to_string(),
            status: status.to_string(),
            preview,
            error,
            stages_complete,
        },
    );
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

/// Run all 6 pipeline stages for a lecture, persisting results and emitting
/// real-time `pipeline-stage` events.  Designed to be spawned in a background
/// task so it does not block the Tauri main thread.
pub async fn run_full_pipeline(lecture_id: String, app: AppHandle) {
    let db = match app.try_state::<AppDatabase>() {
        Some(db) => db.inner().clone(),
        None => {
            eprintln!("[pipeline] AppDatabase not managed — cannot run pipeline.");
            return;
        }
    };

    // ── Load transcript ──────────────────────────────────────────────────────
    let transcript_text = {
        let conn = match db.connect() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[pipeline] DB connect failed: {e}");
                return;
            }
        };
        match queries::get_transcript_by_lecture_id(&conn, &lecture_id) {
            Ok(Some(r)) => r.full_text,
            Ok(None) => {
                eprintln!("[pipeline] No transcript found for lecture {lecture_id}");
                return;
            }
            Err(e) => {
                eprintln!("[pipeline] Transcript query failed: {e}");
                return;
            }
        }
    };

    // ── Load settings ────────────────────────────────────────────────────────
    let settings = match get_settings(app.clone()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[pipeline] Settings load failed: {e}");
            return;
        }
    };

    let model = settings.llm_model.clone();
    let level = settings.personalization_level.clone();
    let client = OllamaClient::new(settings.ollama_url.clone());

    // Mark lecture as processing
    if let Ok(conn) = db.connect() {
        let _ = queries::update_lecture_status(&conn, &lecture_id, "processing");
    }

    // ── Chunking ─────────────────────────────────────────────────────────────
    let chunks = chunk_transcript(&transcript_text);
    let is_long = chunks.len() > 1;

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1 — Summary
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "summary";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 0);
    mark_stage_starting(&db, &lecture_id, stage);

    let summary_result: Result<String, String> = async {
        if is_long {
            // Summarise each chunk, then combine
            let mut chunk_summaries = Vec::new();
            for (i, chunk) in chunks.iter().enumerate() {
                let sub_stage = format!("summary_chunk_{}", i + 1);
                let prompt = prompt_templates::summarize_prompt(chunk, &level);
                let s = run_stage(
                    &client,
                    &app,
                    &model,
                    &prompt,
                    &lecture_id,
                    &sub_stage,
                    false,
                )
                .await?;
                chunk_summaries.push(s);
            }
            // Combine chunk summaries
            let combined = chunk_summaries.join("\n\n---\n\n");
            let final_prompt = prompt_templates::summarize_prompt(&combined, &level);
            run_stage(
                &client,
                &app,
                &model,
                &final_prompt,
                &lecture_id,
                stage,
                false,
            )
            .await
        } else {
            let prompt = prompt_templates::summarize_prompt(&transcript_text, &level);
            run_stage(&client, &app, &model, &prompt, &lecture_id, stage, false).await
        }
    }
    .await;

    let summary_text = match summary_result {
        Ok(text) => {
            let preview = make_preview(&text);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 1);
            if let Ok(conn) = db.connect() {
                let _ = queries::update_lecture_summary(&conn, &lecture_id, &text);
            }
            text
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 1);
            // Use a trimmed transcript as fallback context for subsequent stages
            transcript_text[..transcript_text.len().min(CHUNK_CHARS)].to_string()
        }
    };

    // For all remaining stages we use: summary + first CHUNK_CHARS of transcript
    // (avoids overwhelming the LLM on very long lectures)
    let context_text = if is_long {
        let first_chunk = &chunks[0];
        format!(
            "LECTURE SUMMARY:\n{summary_text}\n\nFIRST SECTION OF TRANSCRIPT:\n{first_chunk}\n(Note: this is a long lecture; the above is a representative excerpt.)"
        )
    } else {
        transcript_text.clone()
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2 — Structured Notes
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "notes";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 1);
    mark_stage_starting(&db, &lecture_id, stage);

    let notes_prompt = prompt_templates::structured_notes_prompt(&context_text, &level);
    match run_stage(
        &client,
        &app,
        &model,
        &notes_prompt,
        &lecture_id,
        stage,
        true,
    )
    .await
    {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 2);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_notes(&conn, &lecture_id, &json);
            }
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 2);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3 — Quiz
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "quiz";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 2);
    mark_stage_starting(&db, &lecture_id, stage);

    let quiz_prompt = prompt_templates::quiz_prompt(&context_text, &level);
    match run_stage(
        &client,
        &app,
        &model,
        &quiz_prompt,
        &lecture_id,
        stage,
        true,
    )
    .await
    {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 3);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_quiz(&conn, &lecture_id, &json);
            }
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 3);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4 — Flashcards
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "flashcards";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 3);
    mark_stage_starting(&db, &lecture_id, stage);

    let flashcards_prompt = prompt_templates::flashcards_prompt(&context_text, &level);
    match run_stage(
        &client,
        &app,
        &model,
        &flashcards_prompt,
        &lecture_id,
        stage,
        true,
    )
    .await
    {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 4);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_flashcards(&conn, &lecture_id, &json);
            }
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 4);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5 — Mind Map
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "mindmap";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 4);
    mark_stage_starting(&db, &lecture_id, stage);

    let mindmap_prompt = prompt_templates::mindmap_prompt(&context_text, &level);
    match run_stage(
        &client,
        &app,
        &model,
        &mindmap_prompt,
        &lecture_id,
        stage,
        true,
    )
    .await
    {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 5);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_mindmap(&conn, &lecture_id, &json);
            }
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 5);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6 — Research Keywords
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "keywords";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 5);
    mark_stage_starting(&db, &lecture_id, stage);

    // Extract keywords from the summary for efficiency
    let keywords_input = if summary_text.is_empty() {
        &context_text
    } else {
        &summary_text
    };
    let keywords_prompt = prompt_templates::extract_keywords_prompt(keywords_input);
    match run_stage(
        &client,
        &app,
        &model,
        &keywords_prompt,
        &lecture_id,
        stage,
        true,
    )
    .await
    {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 6);
            if let Ok(conn) = db.connect() {
                let _ = queries::update_lecture_keywords(&conn, &lecture_id, &json);
            }
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 6);
        }
    }

    // ── Finalise lecture status ───────────────────────────────────────────────
    if let Ok(conn) = db.connect() {
        let _ = queries::update_lecture_status(&conn, &lecture_id, "complete");
    }

    // Emit overall completion event
    emit_stage(&app, &lecture_id, "pipeline", "complete", None, None, 6);
}
