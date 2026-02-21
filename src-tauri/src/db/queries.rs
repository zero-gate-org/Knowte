use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LectureRecord {
    pub id: String,
    pub filename: String,
    pub audio_path: String,
    pub duration: f64,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptRecord {
    pub id: String,
    pub lecture_id: String,
    pub full_text: String,
    pub segments_json: String,
    pub model_used: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineStageRecord {
    pub id: String,
    pub lecture_id: String,
    pub stage_name: String,
    pub status: String,
    pub result_preview: Option<String>,
    pub error: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LectureSummaryRecord {
    pub id: String,
    pub title: String,
    pub filename: String,
    pub audio_path: String,
    pub duration: f64,
    pub status: String,
    pub created_at: String,
    pub summary: Option<String>,
    pub stages_complete: i64,
}

fn fallback_title(filename: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    stem.unwrap_or(filename).to_string()
}

fn title_from_notes(notes_json: Option<&str>, filename: &str) -> String {
    let parsed = notes_json
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
        .and_then(|value| {
            value
                .get("title")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        })
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    parsed.unwrap_or_else(|| fallback_title(filename))
}

fn to_fts_query(query: &str) -> String {
    let mut terms = Vec::new();
    for token in query.split_whitespace() {
        let cleaned: String = token
            .chars()
            .filter(|character| character.is_alphanumeric() || *character == '_')
            .collect();

        if !cleaned.is_empty() {
            terms.push(format!("{cleaned}*"));
        }
    }

    terms.join(" AND ")
}

fn sync_search_document(connection: &Connection, lecture_id: &str) -> rusqlite::Result<()> {
    connection.execute(
        "DELETE FROM lecture_search_fts WHERE lecture_id = ?1",
        params![lecture_id],
    )?;

    connection.execute(
        r#"
        INSERT INTO lecture_search_fts (lecture_id, transcript_text, notes_text)
        SELECT
            l.id,
            COALESCE(t.full_text, ''),
            COALESCE(n.notes_json, '')
        FROM lectures l
        LEFT JOIN transcripts t ON t.lecture_id = l.id
        LEFT JOIN notes n ON n.lecture_id = l.id
        WHERE l.id = ?1
        "#,
        params![lecture_id],
    )?;

    Ok(())
}

pub fn rebuild_lecture_search_index(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM lecture_search_fts", [])?;
    connection.execute(
        r#"
        INSERT INTO lecture_search_fts (lecture_id, transcript_text, notes_text)
        SELECT
            l.id,
            COALESCE(t.full_text, ''),
            COALESCE(n.notes_json, '')
        FROM lectures l
        LEFT JOIN transcripts t ON t.lecture_id = l.id
        LEFT JOIN notes n ON n.lecture_id = l.id
        "#,
        [],
    )?;

    Ok(())
}

pub fn upsert_lecture(connection: &Connection, lecture: &LectureRecord) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        INSERT INTO lectures (id, filename, audio_path, duration, status, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET
            filename = excluded.filename,
            audio_path = excluded.audio_path,
            duration = excluded.duration,
            status = excluded.status,
            created_at = excluded.created_at
        "#,
        params![
            lecture.id,
            lecture.filename,
            lecture.audio_path,
            lecture.duration,
            lecture.status,
            lecture.created_at
        ],
    )?;

    Ok(())
}

pub fn update_lecture_status(
    connection: &Connection,
    lecture_id: &str,
    status: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        "UPDATE lectures SET status = ?1 WHERE id = ?2",
        params![status, lecture_id],
    )?;
    Ok(())
}

pub fn update_lecture_summary(
    connection: &Connection,
    lecture_id: &str,
    summary: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        "UPDATE lectures SET summary = ?1 WHERE id = ?2",
        params![summary, lecture_id],
    )?;
    Ok(())
}

pub fn update_lecture_keywords(
    connection: &Connection,
    lecture_id: &str,
    keywords_json: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        "UPDATE lectures SET keywords_json = ?1 WHERE id = ?2",
        params![keywords_json, lecture_id],
    )?;
    Ok(())
}

pub fn get_lecture_by_id(
    connection: &Connection,
    lecture_id: &str,
) -> rusqlite::Result<Option<LectureRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, filename, audio_path, duration, status, created_at
        FROM lectures
        WHERE id = ?1
        "#,
    )?;

    let result = statement.query_row(params![lecture_id], |row| {
        Ok(LectureRecord {
            id: row.get(0)?,
            filename: row.get(1)?,
            audio_path: row.get(2)?,
            duration: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
        })
    });

    match result {
        Ok(lecture) => Ok(Some(lecture)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn list_lectures(connection: &Connection) -> rusqlite::Result<Vec<LectureSummaryRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT
            l.id,
            l.filename,
            l.audio_path,
            l.duration,
            l.status,
            l.created_at,
            l.summary,
            n.notes_json,
            COALESCE((
                SELECT COUNT(*)
                FROM pipeline_stages ps
                WHERE ps.lecture_id = l.id
                  AND ps.status = 'complete'
            ), 0) AS stages_complete
        FROM lectures l
        LEFT JOIN notes n ON n.lecture_id = l.id
        ORDER BY datetime(l.created_at) DESC
        "#,
    )?;

    let rows = statement.query_map([], |row| {
        let filename: String = row.get(1)?;
        let notes_json: Option<String> = row.get(7)?;

        Ok(LectureSummaryRecord {
            id: row.get(0)?,
            title: title_from_notes(notes_json.as_deref(), &filename),
            filename,
            audio_path: row.get(2)?,
            duration: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
            summary: row.get(6)?,
            stages_complete: row.get(8)?,
        })
    })?;

    rows.collect()
}

pub fn search_lectures(
    connection: &Connection,
    query: &str,
) -> rusqlite::Result<Vec<LectureSummaryRecord>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return list_lectures(connection);
    }

    rebuild_lecture_search_index(connection)?;
    let fts_query = to_fts_query(trimmed);

    let mut statement = connection.prepare(
        r#"
        SELECT DISTINCT
            l.id,
            l.filename,
            l.audio_path,
            l.duration,
            l.status,
            l.created_at,
            l.summary,
            n.notes_json,
            COALESCE((
                SELECT COUNT(*)
                FROM pipeline_stages ps
                WHERE ps.lecture_id = l.id
                  AND ps.status = 'complete'
            ), 0) AS stages_complete
        FROM lectures l
        LEFT JOIN notes n ON n.lecture_id = l.id
        LEFT JOIN lecture_search_fts fts ON fts.lecture_id = l.id
        WHERE
            lower(l.filename) LIKE '%' || lower(?1) || '%'
            OR lower(COALESCE(fts.transcript_text, '')) LIKE '%' || lower(?1) || '%'
            OR lower(COALESCE(fts.notes_text, '')) LIKE '%' || lower(?1) || '%'
            OR (
                ?2 != ''
                AND l.id IN (
                    SELECT lecture_id
                    FROM lecture_search_fts
                    WHERE lecture_search_fts MATCH ?2
                )
            )
        ORDER BY datetime(l.created_at) DESC
        "#,
    )?;

    let rows = statement.query_map(params![trimmed, fts_query], |row| {
        let filename: String = row.get(1)?;
        let notes_json: Option<String> = row.get(7)?;

        Ok(LectureSummaryRecord {
            id: row.get(0)?,
            title: title_from_notes(notes_json.as_deref(), &filename),
            filename,
            audio_path: row.get(2)?,
            duration: row.get(3)?,
            status: row.get(4)?,
            created_at: row.get(5)?,
            summary: row.get(6)?,
            stages_complete: row.get(8)?,
        })
    })?;

    rows.collect()
}

pub fn delete_lecture(connection: &Connection, lecture_id: &str) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM lectures WHERE id = ?1", params![lecture_id])?;
    connection.execute(
        "DELETE FROM lecture_search_fts WHERE lecture_id = ?1",
        params![lecture_id],
    )?;
    Ok(())
}

pub fn upsert_transcript(
    connection: &Connection,
    transcript: &TranscriptRecord,
) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        INSERT INTO transcripts (id, lecture_id, full_text, segments_json, model_used, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(lecture_id) DO UPDATE SET
            id = excluded.id,
            full_text = excluded.full_text,
            segments_json = excluded.segments_json,
            model_used = excluded.model_used,
            created_at = excluded.created_at
        "#,
        params![
            transcript.id,
            transcript.lecture_id,
            transcript.full_text,
            transcript.segments_json,
            transcript.model_used,
            transcript.created_at
        ],
    )?;

    sync_search_document(connection, &transcript.lecture_id)?;

    Ok(())
}

pub fn get_transcript_by_lecture_id(
    connection: &Connection,
    lecture_id: &str,
) -> rusqlite::Result<Option<TranscriptRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, lecture_id, full_text, segments_json, model_used, created_at
        FROM transcripts
        WHERE lecture_id = ?1
        "#,
    )?;

    let result = statement.query_row(params![lecture_id], |row| {
        Ok(TranscriptRecord {
            id: row.get(0)?,
            lecture_id: row.get(1)?,
            full_text: row.get(2)?,
            segments_json: row.get(3)?,
            model_used: row.get(4)?,
            created_at: row.get(5)?,
        })
    });

    match result {
        Ok(transcript) => Ok(Some(transcript)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn get_transcript_by_id(
    connection: &Connection,
    transcript_id: &str,
) -> rusqlite::Result<Option<TranscriptRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, lecture_id, full_text, segments_json, model_used, created_at
        FROM transcripts
        WHERE id = ?1
        "#,
    )?;

    let result = statement.query_row(params![transcript_id], |row| {
        Ok(TranscriptRecord {
            id: row.get(0)?,
            lecture_id: row.get(1)?,
            full_text: row.get(2)?,
            segments_json: row.get(3)?,
            model_used: row.get(4)?,
            created_at: row.get(5)?,
        })
    });

    match result {
        Ok(transcript) => Ok(Some(transcript)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn update_transcript_content(
    connection: &Connection,
    transcript_id: &str,
    full_text: &str,
    segments_json: &str,
) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        UPDATE transcripts
        SET full_text = ?1, segments_json = ?2
        WHERE id = ?3
        "#,
        params![full_text, segments_json, transcript_id],
    )?;

    Ok(())
}

// ─── Pipeline Stage Queries ───────────────────────────────────────────────────

pub fn upsert_pipeline_stage(
    connection: &Connection,
    stage: &PipelineStageRecord,
) -> rusqlite::Result<()> {
    connection.execute(
        r#"
        INSERT INTO pipeline_stages
            (id, lecture_id, stage_name, status, result_preview, error, started_at, completed_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(lecture_id, stage_name) DO UPDATE SET
            id             = excluded.id,
            status         = excluded.status,
            result_preview = excluded.result_preview,
            error          = excluded.error,
            started_at     = excluded.started_at,
            completed_at   = excluded.completed_at
        "#,
        params![
            stage.id,
            stage.lecture_id,
            stage.stage_name,
            stage.status,
            stage.result_preview,
            stage.error,
            stage.started_at,
            stage.completed_at,
        ],
    )?;
    Ok(())
}

pub fn get_pipeline_stages(
    connection: &Connection,
    lecture_id: &str,
) -> rusqlite::Result<Vec<PipelineStageRecord>> {
    let mut statement = connection.prepare(
        r#"
        SELECT id, lecture_id, stage_name, status, result_preview, error, started_at, completed_at
        FROM pipeline_stages
        WHERE lecture_id = ?1
        ORDER BY rowid ASC
        "#,
    )?;

    let rows = statement.query_map(params![lecture_id], |row| {
        Ok(PipelineStageRecord {
            id: row.get(0)?,
            lecture_id: row.get(1)?,
            stage_name: row.get(2)?,
            status: row.get(3)?,
            result_preview: row.get(4)?,
            error: row.get(5)?,
            started_at: row.get(6)?,
            completed_at: row.get(7)?,
        })
    })?;

    rows.collect()
}

// ─── LLM Stage Cache Queries ────────────────────────────────────────────────

pub fn upsert_llm_stage_cache(
    connection: &Connection,
    lecture_id: &str,
    stage_name: &str,
    transcript_hash: &str,
    result_text: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO llm_stage_cache
            (id, lecture_id, stage_name, transcript_hash, result_text, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(lecture_id, stage_name, transcript_hash) DO UPDATE SET
            id = excluded.id,
            result_text = excluded.result_text,
            created_at = excluded.created_at
        "#,
        params![id, lecture_id, stage_name, transcript_hash, result_text, now],
    )?;
    Ok(())
}

pub fn get_llm_stage_cache(
    connection: &Connection,
    lecture_id: &str,
    stage_name: &str,
    transcript_hash: &str,
) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        r#"
        SELECT result_text
        FROM llm_stage_cache
        WHERE lecture_id = ?1
          AND stage_name = ?2
          AND transcript_hash = ?3
        "#,
        params![lecture_id, stage_name, transcript_hash],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn count_llm_stage_cache(
    connection: &Connection,
    lecture_id: &str,
    transcript_hash: &str,
) -> rusqlite::Result<i64> {
    connection.query_row(
        r#"
        SELECT COUNT(*)
        FROM llm_stage_cache
        WHERE lecture_id = ?1
          AND transcript_hash = ?2
        "#,
        params![lecture_id, transcript_hash],
        |row| row.get(0),
    )
}

// ─── Notes Queries ────────────────────────────────────────────────────────────

pub fn upsert_notes(
    connection: &Connection,
    lecture_id: &str,
    notes_json: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO notes (id, lecture_id, notes_json, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(lecture_id) DO UPDATE SET
            notes_json = excluded.notes_json,
            created_at = excluded.created_at
        "#,
        params![id, lecture_id, notes_json, now],
    )?;

    sync_search_document(connection, lecture_id)?;
    Ok(())
}

pub fn get_notes(connection: &Connection, lecture_id: &str) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        "SELECT notes_json FROM notes WHERE lecture_id = ?1",
        params![lecture_id],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// ─── Quiz Queries ─────────────────────────────────────────────────────────────

pub fn upsert_quiz(
    connection: &Connection,
    lecture_id: &str,
    quiz_json: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO quizzes (id, lecture_id, quiz_json, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(lecture_id) DO UPDATE SET
            quiz_json  = excluded.quiz_json,
            created_at = excluded.created_at
        "#,
        params![id, lecture_id, quiz_json, now],
    )?;
    Ok(())
}

pub fn get_quiz(connection: &Connection, lecture_id: &str) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        "SELECT quiz_json FROM quizzes WHERE lecture_id = ?1",
        params![lecture_id],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// ─── Flashcards Queries ───────────────────────────────────────────────────────

pub fn upsert_flashcards(
    connection: &Connection,
    lecture_id: &str,
    cards_json: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO flashcards_output (id, lecture_id, cards_json, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(lecture_id) DO UPDATE SET
            cards_json = excluded.cards_json,
            created_at = excluded.created_at
        "#,
        params![id, lecture_id, cards_json, now],
    )?;
    Ok(())
}

pub fn get_flashcards(
    connection: &Connection,
    lecture_id: &str,
) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        "SELECT cards_json FROM flashcards_output WHERE lecture_id = ?1",
        params![lecture_id],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// ─── Mind Map Queries ─────────────────────────────────────────────────────────

pub fn upsert_mindmap(
    connection: &Connection,
    lecture_id: &str,
    mindmap_json: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO mindmaps (id, lecture_id, mindmap_json, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(lecture_id) DO UPDATE SET
            mindmap_json = excluded.mindmap_json,
            created_at   = excluded.created_at
        "#,
        params![id, lecture_id, mindmap_json, now],
    )?;
    Ok(())
}

pub fn get_mindmap(connection: &Connection, lecture_id: &str) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        "SELECT mindmap_json FROM mindmaps WHERE lecture_id = ?1",
        params![lecture_id],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_lecture_summary(
    connection: &Connection,
    lecture_id: &str,
) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        "SELECT summary FROM lectures WHERE id = ?1",
        params![lecture_id],
        |row| row.get::<_, Option<String>>(0),
    );
    match result {
        Ok(v) => Ok(v),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// ─── Keywords Query ───────────────────────────────────────────────────────────

pub fn get_lecture_keywords(
    connection: &Connection,
    lecture_id: &str,
) -> rusqlite::Result<Vec<String>> {
    let result = connection.query_row(
        "SELECT keywords_json FROM lectures WHERE id = ?1",
        params![lecture_id],
        |row| row.get::<_, Option<String>>(0),
    );
    match result {
        Ok(Some(json)) => {
            let keywords: Vec<String> = serde_json::from_str(&json).unwrap_or_default();
            Ok(keywords)
        }
        Ok(None) => Ok(vec![]),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(vec![]),
        Err(e) => Err(e),
    }
}

// ─── Papers Queries ───────────────────────────────────────────────────────────

pub fn upsert_papers(
    connection: &Connection,
    lecture_id: &str,
    papers_json: &str,
) -> rusqlite::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO papers (id, lecture_id, papers_json, created_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(lecture_id) DO UPDATE SET
            papers_json = excluded.papers_json,
            created_at  = excluded.created_at
        "#,
        params![id, lecture_id, papers_json, now],
    )?;
    Ok(())
}

pub fn get_papers(connection: &Connection, lecture_id: &str) -> rusqlite::Result<Option<String>> {
    let result = connection.query_row(
        "SELECT papers_json FROM papers WHERE lecture_id = ?1",
        params![lecture_id],
        |row| row.get::<_, String>(0),
    );
    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// ─── Quiz Attempts ────────────────────────────────────────────────────────────

/// Insert a record of one quiz attempt and return its generated id.
pub fn insert_quiz_attempt(
    connection: &Connection,
    lecture_id: &str,
    answers_json: &str,
    score: i64,
    total_questions: i64,
) -> rusqlite::Result<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    connection.execute(
        r#"
        INSERT INTO quiz_attempts (id, lecture_id, answers_json, score, total_questions, attempted_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![id, lecture_id, answers_json, score, total_questions, now],
    )?;
    Ok(id)
}
