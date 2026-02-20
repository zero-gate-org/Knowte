pub mod queries;
pub mod schema;

use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Unable to access the app data directory.")]
    AppDataDirUnavailable,
    #[error("Unable to initialize the app database.")]
    MigrationFailed(#[from] rusqlite::Error),
    #[error("Unable to open the app database.")]
    OpenFailed,
}

impl From<DbError> for String {
    fn from(value: DbError) -> Self {
        value.to_string()
    }
}

#[derive(Clone)]
pub struct AppDatabase {
    db_path: Arc<PathBuf>,
}

impl AppDatabase {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path: Arc::new(db_path),
        }
    }

    pub fn connect(&self) -> Result<Connection, DbError> {
        let connection = Connection::open(self.db_path()).map_err(|_| DbError::OpenFailed)?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(DbError::MigrationFailed)?;
        Ok(connection)
    }

    pub fn db_path(&self) -> &Path {
        self.db_path.as_path()
    }
}

pub fn init_database(app: &AppHandle) -> Result<AppDatabase, DbError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DbError::AppDataDirUnavailable)?;
    fs::create_dir_all(&app_data_dir).map_err(|_| DbError::AppDataDirUnavailable)?;

    let database = AppDatabase::new(app_data_dir.join("cognote.sqlite"));
    let connection = database.connect()?;
    schema::run_migrations(&connection)?;
    Ok(database)
}
