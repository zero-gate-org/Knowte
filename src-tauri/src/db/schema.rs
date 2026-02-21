use rusqlite::Connection;

pub fn run_migrations(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS lectures (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            audio_path TEXT NOT NULL,
            duration REAL NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            summary TEXT,
            keywords_json TEXT
        );

        CREATE TABLE IF NOT EXISTS transcripts (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL UNIQUE,
            full_text TEXT NOT NULL,
            segments_json TEXT NOT NULL,
            model_used TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS pipeline_stages (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL,
            stage_name TEXT NOT NULL,
            status TEXT NOT NULL,
            result_preview TEXT,
            error TEXT,
            started_at TEXT,
            completed_at TEXT,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_stages_lecture_stage
            ON pipeline_stages(lecture_id, stage_name);

        CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL UNIQUE,
            notes_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quizzes (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL UNIQUE,
            quiz_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS flashcards_output (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL UNIQUE,
            cards_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS mindmaps (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL UNIQUE,
            mindmap_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS papers (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL UNIQUE,
            papers_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS quiz_attempts (
            id TEXT PRIMARY KEY,
            lecture_id TEXT NOT NULL,
            answers_json TEXT NOT NULL,
            score INTEGER NOT NULL,
            total_questions INTEGER NOT NULL,
            attempted_at TEXT NOT NULL,
            FOREIGN KEY (lecture_id) REFERENCES lectures(id) ON DELETE CASCADE
        );
        "#,
    )

    // Note: ALTER TABLE cannot be wrapped in IF NOT EXISTS in SQLite,
    // so new columns for existing tables are handled by CREATE TABLE IF NOT EXISTS
    // with the columns already present above.
}
