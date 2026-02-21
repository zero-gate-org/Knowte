use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;
use fs2::available_space;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub ollama_url: String,
    pub whisper_model: String,
    pub llm_model: String,
    #[serde(default = "Settings::default_llm_timeout_seconds")]
    pub llm_timeout_seconds: u64,
    pub personalization_level: String,
    pub language: String,
    pub export_path: String,
    #[serde(default = "Settings::default_enable_research")]
    pub enable_research: bool,
    #[serde(default = "Settings::default_theme")]
    pub theme: String,
    #[serde(default = "Settings::default_delete_audio_after_processing")]
    pub delete_audio_after_processing: bool,
}

impl Default for Settings {
    fn default() -> Self {
        let export_path = dirs::document_dir()
            .map(|p| p.join("Cognote"))
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        Self {
            ollama_url: "http://localhost:11434".to_string(),
            whisper_model: "base".to_string(),
            llm_model: "llama3.1:8b".to_string(),
            llm_timeout_seconds: Self::default_llm_timeout_seconds(),
            personalization_level: "undergraduate_2nd_year".to_string(),
            language: "en".to_string(),
            export_path,
            enable_research: true,
            theme: Self::default_theme(),
            delete_audio_after_processing: Self::default_delete_audio_after_processing(),
        }
    }
}

impl Settings {
    fn default_enable_research() -> bool {
        true
    }

    fn default_llm_timeout_seconds() -> u64 {
        300
    }

    fn default_theme() -> String {
        "dark".to_string()
    }

    fn default_delete_audio_after_processing() -> bool {
        false
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaTagsResponse {
    pub models: Vec<OllamaModel>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OllamaStatus {
    pub connected: bool,
    pub models: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageUsage {
    pub app_data_dir: String,
    pub app_data_bytes: u64,
    pub lectures_bytes: u64,
    pub prepared_audio_bytes: u64,
    pub free_bytes: u64,
}

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Unable to resolve the app data directory.".to_string())?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|_| "Unable to create the app data directory.".to_string())?;
    Ok(app_data_dir.join("settings.json"))
}

#[tauri::command]
pub async fn check_ollama_status(ollama_url: String) -> Result<OllamaStatus, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

    if ollama_url.trim().is_empty() {
        return Ok(OllamaStatus {
            connected: false,
            models: vec![],
            error: Some("Ollama URL is empty. Enter a valid URL and try again.".to_string()),
        });
    }

    let url = format!("{}/api/tags", ollama_url);

    let status = match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<OllamaTagsResponse>().await {
                    Ok(data) => {
                        let models: Vec<String> = data.models.into_iter().map(|m| m.name).collect();
                        Ok(OllamaStatus {
                            connected: true,
                            models,
                            error: None,
                        })
                    }
                    Err(e) => Ok(OllamaStatus {
                        connected: false,
                        models: vec![],
                        error: Some(format!("Failed to parse response: {}", e)),
                    }),
                }
            } else {
                Ok(OllamaStatus {
                    connected: false,
                    models: vec![],
                    error: Some(format!("HTTP error: {}", response.status())),
                })
            }
        }
        Err(e) => Ok(OllamaStatus {
            connected: false,
            models: vec![],
            error: Some(format!("Connection failed: {}. Is Ollama running?", e)),
        }),
    };

    status
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let settings_path = get_settings_path(&app)?;

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        let settings: Settings = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;
        Ok(settings)
    } else {
        let settings = Settings::default();
        let content = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        fs::write(&settings_path, &content)
            .map_err(|e| format!("Failed to write settings: {}", e))?;
        Ok(settings)
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let settings_path = get_settings_path(&app)?;
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, &content).map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn get_storage_usage(app: AppHandle) -> Result<StorageUsage, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Unable to resolve the app data directory.".to_string())?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|_| "Unable to create the app data directory.".to_string())?;

    let lectures_dir = app_data_dir.join("lectures");
    let prepared_audio_dir = app_data_dir.join("prepared-audio");

    let app_data_bytes = directory_size(&app_data_dir)?;
    let lectures_bytes = directory_size(&lectures_dir)?;
    let prepared_audio_bytes = directory_size(&prepared_audio_dir)?;
    let free_bytes =
        available_space(&app_data_dir).map_err(|_| "Unable to read free disk space.".to_string())?;

    Ok(StorageUsage {
        app_data_dir: app_data_dir.to_string_lossy().to_string(),
        app_data_bytes,
        lectures_bytes,
        prepared_audio_bytes,
        free_bytes,
    })
}

fn directory_size(path: &std::path::Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    if path.is_file() {
        let metadata = fs::metadata(path).map_err(|_| "Unable to read file metadata.".to_string())?;
        return Ok(metadata.len());
    }

    let mut total = 0_u64;
    let entries = fs::read_dir(path).map_err(|_| "Unable to read directory.".to_string())?;
    for entry in entries {
        let entry = entry.map_err(|_| "Unable to read directory entry.".to_string())?;
        total = total.saturating_add(directory_size(&entry.path())?);
    }

    Ok(total)
}
