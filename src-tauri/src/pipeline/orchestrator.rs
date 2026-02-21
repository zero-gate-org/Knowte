use crate::commands::llm::{parse_json_from_response, OllamaClient};
use crate::commands::settings::get_settings;
use crate::db::{queries, AppDatabase};
use crate::utils::prompt_templates;
use chrono::Utc;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
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
const LONG_TRANSCRIPT_WORD_THRESHOLD: usize = 10_000;
const SECTION_TARGET_WORDS: usize = 1_800;
const SECTION_MAX_WORDS: usize = 2_600;

#[derive(Debug, Clone, Copy)]
pub struct PipelineRunOptions {
    pub use_cache: bool,
}

impl Default for PipelineRunOptions {
    fn default() -> Self {
        Self { use_cache: true }
    }
}

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

fn transcript_hash(transcript: &str) -> String {
    let mut hasher = DefaultHasher::new();
    transcript.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn contains_topic_shift_marker(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "next,",
        "moving on",
        "let's move on",
        "let us move on",
        "another topic",
        "new section",
        "in summary",
        "to summarize",
        "in conclusion",
        "on the other hand",
        "now we discuss",
        "now let's discuss",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn split_long_transcript_sections(text: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = Vec::new();
    let mut current_words = 0usize;

    let mut units: Vec<String> = text
        .replace("\r\n", "\n")
        .split("\n\n")
        .map(str::trim)
        .filter(|unit| !unit.is_empty())
        .map(ToOwned::to_owned)
        .collect();

    if units.len() < 4 {
        units = text
            .split_terminator(|c: char| matches!(c, '.' | '!' | '?'))
            .map(str::trim)
            .filter(|unit| !unit.is_empty())
            .map(|unit| format!("{unit}."))
            .collect();
    }

    for unit in units {
        let words = unit.split_whitespace().count();
        if words == 0 {
            continue;
        }

        let should_break_for_shift =
            current_words >= SECTION_TARGET_WORDS && contains_topic_shift_marker(&unit);
        let would_exceed_max = current_words + words > SECTION_MAX_WORDS;
        if !current.is_empty() && (should_break_for_shift || would_exceed_max) {
            sections.push(current.join("\n\n"));
            current.clear();
            current_words = 0;
        }

        current.push(unit);
        current_words += words;
    }

    if !current.is_empty() {
        sections.push(current.join("\n\n"));
    }

    if sections.is_empty() {
        vec![text.to_string()]
    } else {
        sections
    }
}

fn merge_notes_sections(section_jsons: &[String]) -> Result<String, String> {
    let mut title = String::new();
    let mut topics: Vec<serde_json::Value> = Vec::new();
    let mut key_terms: Vec<serde_json::Value> = Vec::new();
    let mut takeaways: Vec<String> = Vec::new();
    let mut seen_terms: HashSet<String> = HashSet::new();
    let mut seen_takeaways: HashSet<String> = HashSet::new();

    for section in section_jsons {
        let value: serde_json::Value =
            serde_json::from_str(section).map_err(|_| "Unable to parse notes section JSON.")?;
        if title.is_empty() {
            title = value
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
        }

        if let Some(section_topics) = value.get("topics").and_then(serde_json::Value::as_array) {
            topics.extend(section_topics.iter().cloned());
        }

        if let Some(section_terms) = value.get("key_terms").and_then(serde_json::Value::as_array) {
            for term in section_terms {
                let key = term
                    .get("term")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase();
                if key.is_empty() || seen_terms.contains(&key) {
                    continue;
                }
                seen_terms.insert(key);
                key_terms.push(term.clone());
            }
        }

        if let Some(section_takeaways) =
            value.get("takeaways").and_then(serde_json::Value::as_array)
        {
            for takeaway in section_takeaways {
                let text = takeaway.as_str().unwrap_or_default().trim();
                if text.is_empty() {
                    continue;
                }
                let key = text.to_ascii_lowercase();
                if seen_takeaways.contains(&key) {
                    continue;
                }
                seen_takeaways.insert(key);
                takeaways.push(text.to_string());
            }
        }
    }

    if title.is_empty() {
        title = "Structured Lecture Notes".to_string();
    }

    serde_json::to_string(&serde_json::json!({
        "title": title,
        "topics": topics,
        "key_terms": key_terms,
        "takeaways": takeaways,
    }))
    .map_err(|_| "Unable to serialize merged notes.".to_string())
}

fn merge_quiz_sections(section_jsons: &[String]) -> Result<String, String> {
    let mut questions: Vec<serde_json::Value> = Vec::new();

    for section in section_jsons {
        let value: serde_json::Value =
            serde_json::from_str(section).map_err(|_| "Unable to parse quiz section JSON.")?;
        if let Some(section_questions) =
            value.get("questions").and_then(serde_json::Value::as_array)
        {
            questions.extend(section_questions.iter().cloned());
        }
    }

    for (index, question) in questions.iter_mut().enumerate() {
        if let Some(object) = question.as_object_mut() {
            object.insert(
                "id".to_string(),
                serde_json::Value::Number(serde_json::Number::from((index + 1) as i64)),
            );
        }
    }

    serde_json::to_string(&serde_json::json!({ "questions": questions }))
        .map_err(|_| "Unable to serialize merged quiz.".to_string())
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

fn find_first_index(haystack: &str, needles: &[&str]) -> Option<usize> {
    needles
        .iter()
        .filter_map(|needle| haystack.find(needle))
        .min()
}

fn collapse_blank_lines(text: &str) -> String {
    let mut lines = Vec::new();
    let mut previous_blank = true;

    for line in text.lines() {
        let trimmed_end = line.trim_end();
        let is_blank = trimmed_end.trim().is_empty();
        if is_blank {
            if previous_blank {
                continue;
            }
            lines.push(String::new());
            previous_blank = true;
        } else {
            lines.push(trimmed_end.to_string());
            previous_blank = false;
        }
    }

    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }

    lines.join("\n")
}

fn sanitize_summary_text(raw: &str) -> String {
    let fallback = raw.trim();
    if fallback.is_empty() {
        return String::new();
    }

    let mut text = raw
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .filter(|line| !line.trim_start().starts_with("```"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if text.is_empty() {
        return fallback.to_string();
    }

    // Remove known "extra assistant" sections that should not be in final notes.
    let lower = text.to_ascii_lowercase();
    if let Some(cut_at) = find_first_index(
        &lower,
        &[
            "\n**rationale",
            "\nrationale for language",
            "\nrationale:",
            "\nwould you like",
            "\nlet me know if you'd like",
            "\ni can also",
            "\nif you'd like",
        ],
    ) {
        text = text[..cut_at].trim_end().to_string();
    }

    // If the model appended a follow-up prompt inline, trim it from the tail.
    let lower = text.to_ascii_lowercase();
    for marker in [
        "would you like",
        "let me know if you'd like",
        "if you'd like,",
        "i can also",
    ] {
        if let Some(idx) = lower.find(marker) {
            if idx >= lower.len() / 2 {
                text = text[..idx].trim_end().to_string();
                break;
            }
        }
    }

    // If there's a conversational preface before a clear content marker,
    // discard the preface and keep the actual summary body.
    let lower = text.to_ascii_lowercase();
    let mut content_markers: Vec<usize> = Vec::new();
    for marker in ["**thesis:**", "thesis:", "## ", "### ", "#### "] {
        if let Some(idx) = lower.find(marker) {
            content_markers.push(idx);
        }
    }
    for marker in ["- ", "* ", "1. ", "1) "] {
        if lower.starts_with(marker) {
            content_markers.push(0);
        }
        let line_start_marker = format!("\n{marker}");
        if let Some(idx) = lower.find(&line_start_marker) {
            content_markers.push(idx + 1);
        }
    }

    if let Some(start_idx) = content_markers.into_iter().min() {
        if start_idx > 0 && start_idx < 700 {
            let prefix = lower[..start_idx].trim();
            let likely_preface = prefix.starts_with("okay")
                || prefix.starts_with("sure")
                || prefix.starts_with("certainly")
                || prefix.starts_with("of course")
                || prefix.contains("here's")
                || prefix.contains("here is")
                || prefix.contains("here’s")
                || prefix.contains("summary");
            if likely_preface {
                text = text[start_idx..].trim_start().to_string();
            }
        }
    }

    let text = collapse_blank_lines(
        text.trim_end_matches(|ch: char| ch == '-' || ch.is_whitespace())
            .trim_end(),
    );

    if text.is_empty() {
        fallback.to_string()
    } else {
        text
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
    let mut raw = client
        .generate(app, model, prompt, lecture_id, stage)
        .await
        .map_err(|e| e.to_string())?;

    if !expect_json {
        return Ok(raw);
    }

    let extracted = parse_json_from_response(&raw);
    raw.clear();
    raw.shrink_to_fit();

    if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        return Ok(extracted);
    }

    // Retry once with an explicit JSON directive
    let retry_prompt = format!(
        "{}\n\nIMPORTANT: Output ONLY valid JSON with no additional text or markdown fences.",
        prompt
    );
    let mut retry_raw = client
        .generate(app, model, &retry_prompt, lecture_id, stage)
        .await
        .map_err(|e| e.to_string())?;

    let retry_extracted = parse_json_from_response(&retry_raw);
    retry_raw.clear();
    retry_raw.shrink_to_fit();

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

fn load_cached_stage_result(
    db: &AppDatabase,
    lecture_id: &str,
    stage_name: &str,
    transcript_hash: &str,
) -> Option<String> {
    let conn = db.connect().ok()?;
    queries::get_llm_stage_cache(&conn, lecture_id, stage_name, transcript_hash)
        .ok()
        .flatten()
}

fn store_cached_stage_result(
    db: &AppDatabase,
    lecture_id: &str,
    stage_name: &str,
    transcript_hash: &str,
    result_text: &str,
) {
    if let Ok(conn) = db.connect() {
        let _ = queries::upsert_llm_stage_cache(
            &conn,
            lecture_id,
            stage_name,
            transcript_hash,
            result_text,
        );
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

fn cleanup_audio_after_processing(app: &AppHandle, db: &AppDatabase, lecture_id: &str) {
    let lecture_audio_path = if let Ok(conn) = db.connect() {
        queries::get_lecture_by_id(&conn, lecture_id)
            .ok()
            .flatten()
            .map(|lecture| lecture.audio_path)
    } else {
        None
    };

    if let Some(audio_path) = lecture_audio_path {
        let _ = std::fs::remove_file(audio_path);
    }

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let prepared = app_data_dir
            .join("prepared-audio")
            .join(format!("{lecture_id}-16khz-mono.wav"));
        let _ = std::fs::remove_file(prepared);
    }
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

/// Run all 6 pipeline stages for a lecture, persisting results and emitting
/// real-time `pipeline-stage` events.  Designed to be spawned in a background
/// task so it does not block the Tauri main thread.
pub async fn run_full_pipeline(lecture_id: String, app: AppHandle) {
    run_full_pipeline_with_options(lecture_id, app, PipelineRunOptions::default()).await;
}

pub async fn run_full_pipeline_with_options(
    lecture_id: String,
    app: AppHandle,
    options: PipelineRunOptions,
) {
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

    let transcript_word_count = transcript_text.split_whitespace().count();
    let transcript_hash = transcript_hash(&transcript_text);
    let should_process_by_section = transcript_word_count > LONG_TRANSCRIPT_WORD_THRESHOLD;
    let long_sections = if should_process_by_section {
        split_long_transcript_sections(&transcript_text)
    } else {
        Vec::new()
    };
    if transcript_word_count < 100 {
        emit_stage(
            &app,
            &lecture_id,
            "pipeline",
            "warning",
            None,
            Some(
                "Transcript has fewer than 100 words, so generated results may be limited."
                    .to_string(),
            ),
            0,
        );
    }

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
    let client = OllamaClient::new(settings.ollama_url.clone(), settings.llm_timeout_seconds);

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
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }

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
            chunk_summaries.clear();
            let final_prompt = prompt_templates::summarize_prompt(&combined, &level);
            let final_output = run_stage(
                &client,
                &app,
                &model,
                &final_prompt,
                &lecture_id,
                stage,
                false,
            )
            .await?;
            Ok(final_output)
        } else {
            let prompt = prompt_templates::summarize_prompt(&transcript_text, &level);
            run_stage(&client, &app, &model, &prompt, &lecture_id, stage, false).await
        }
    }
    .await;

    let summary_text = match summary_result {
        Ok(text) => {
            let cleaned_summary = sanitize_summary_text(&text);
            let preview = make_preview(&cleaned_summary);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 1);
            if let Ok(conn) = db.connect() {
                let _ = queries::update_lecture_summary(&conn, &lecture_id, &cleaned_summary);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &cleaned_summary);
            cleaned_summary
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

    let notes_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }

        if should_process_by_section {
            let mut section_notes = Vec::new();
            let total = long_sections.len();
            for (index, section) in long_sections.iter().enumerate() {
                let sub_stage = format!("notes_section_{}", index + 1);
                emit_stage(&app, &lecture_id, &sub_stage, "starting", None, None, 1);
                let section_context = format!(
                    "LECTURE SUMMARY:\n{summary_text}\n\nSECTION {}/{}:\n{}",
                    index + 1,
                    total,
                    section
                );
                let section_prompt =
                    prompt_templates::structured_notes_prompt(&section_context, &level);
                let section_json = match run_stage(
                    &client,
                    &app,
                    &model,
                    &section_prompt,
                    &lecture_id,
                    &sub_stage,
                    true,
                )
                .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        emit_stage(
                            &app,
                            &lecture_id,
                            &sub_stage,
                            "error",
                            None,
                            Some(error.clone()),
                            1,
                        );
                        return Err(error);
                    }
                };
                let section_preview = make_preview(&section_json);
                emit_stage(
                    &app,
                    &lecture_id,
                    &sub_stage,
                    "complete",
                    Some(section_preview),
                    None,
                    1,
                );
                section_notes.push(section_json);
            }

            let merged = merge_notes_sections(&section_notes)?;
            section_notes.clear();
            Ok(merged)
        } else {
            let notes_prompt = prompt_templates::structured_notes_prompt(&context_text, &level);
            run_stage(
                &client,
                &app,
                &model,
                &notes_prompt,
                &lecture_id,
                stage,
                true,
            )
            .await
        }
    }
    .await;

    match notes_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 2);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_notes(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
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

    let quiz_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }

        if should_process_by_section {
            let mut section_quizzes = Vec::new();
            let total = long_sections.len();
            for (index, section) in long_sections.iter().enumerate() {
                let sub_stage = format!("quiz_section_{}", index + 1);
                emit_stage(&app, &lecture_id, &sub_stage, "starting", None, None, 2);
                let section_context = format!(
                    "LECTURE SUMMARY:\n{summary_text}\n\nSECTION {}/{}:\n{}",
                    index + 1,
                    total,
                    section
                );
                let section_prompt = prompt_templates::quiz_prompt(&section_context, &level);
                let section_json = match run_stage(
                    &client,
                    &app,
                    &model,
                    &section_prompt,
                    &lecture_id,
                    &sub_stage,
                    true,
                )
                .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        emit_stage(
                            &app,
                            &lecture_id,
                            &sub_stage,
                            "error",
                            None,
                            Some(error.clone()),
                            2,
                        );
                        return Err(error);
                    }
                };
                let section_preview = make_preview(&section_json);
                emit_stage(
                    &app,
                    &lecture_id,
                    &sub_stage,
                    "complete",
                    Some(section_preview),
                    None,
                    2,
                );
                section_quizzes.push(section_json);
            }

            let merged = merge_quiz_sections(&section_quizzes)?;
            section_quizzes.clear();
            Ok(merged)
        } else {
            let quiz_prompt = prompt_templates::quiz_prompt(&context_text, &level);
            run_stage(
                &client,
                &app,
                &model,
                &quiz_prompt,
                &lecture_id,
                stage,
                true,
            )
            .await
        }
    }
    .await;

    match quiz_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 3);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_quiz(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
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

    let flashcards_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }
        let flashcards_prompt = prompt_templates::flashcards_prompt(&context_text, &level);
        run_stage(
            &client,
            &app,
            &model,
            &flashcards_prompt,
            &lecture_id,
            stage,
            true,
        )
        .await
    }
    .await;

    match flashcards_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 4);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_flashcards(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
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

    let mindmap_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }
        let mindmap_prompt = prompt_templates::mindmap_prompt(&context_text, &level);
        run_stage(
            &client,
            &app,
            &model,
            &mindmap_prompt,
            &lecture_id,
            stage,
            true,
        )
        .await
    }
    .await;

    match mindmap_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 5);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_mindmap(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
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
    let keywords_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }
        let keywords_prompt = prompt_templates::extract_keywords_prompt(keywords_input);
        run_stage(
            &client,
            &app,
            &model,
            &keywords_prompt,
            &lecture_id,
            stage,
            true,
        )
        .await
    }
    .await;

    match keywords_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 6);
            if let Ok(conn) = db.connect() {
                let _ = queries::update_lecture_keywords(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
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

    if settings.delete_audio_after_processing {
        cleanup_audio_after_processing(&app, &db, &lecture_id);
    }

    // Emit overall completion event
    emit_stage(&app, &lecture_id, "pipeline", "complete", None, None, 6);
}

#[cfg(test)]
mod tests {
    use super::sanitize_summary_text;

    #[test]
    fn sanitize_summary_removes_conversational_wrapper_and_tail() {
        let raw = "Okay, here's a concise summary of the lecture: **Thesis:** Prioritize \
functionality before visual shell.\n\n---\n**Rationale for Language & Tone:** ...\n\
Would you like me to expand on these points?";

        let cleaned = sanitize_summary_text(raw);
        let cleaned_lower = cleaned.to_ascii_lowercase();

        assert!(cleaned.starts_with("**Thesis:**"));
        assert!(!cleaned_lower.contains("rationale for language"));
        assert!(!cleaned_lower.contains("would you like"));
    }

    #[test]
    fn sanitize_summary_keeps_regular_summary_content() {
        let raw = "## Summary\n\n- Main point one\n- Main point two";
        assert_eq!(sanitize_summary_text(raw), raw);
    }
}
