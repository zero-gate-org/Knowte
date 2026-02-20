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
            created_at TEXT NOT NULL
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
        "#,
    )
}
