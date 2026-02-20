use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

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

    Ok(())
}
