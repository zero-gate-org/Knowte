use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub ollama_url: String,
    pub whisper_model: String,
    pub llm_model: String,
    pub personalization_level: String,
    pub language: String,
    pub export_path: String,
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
            personalization_level: "undergraduate_2nd_year".to_string(),
            language: "en".to_string(),
            export_path,
        }
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

fn get_settings_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    fs::create_dir_all(&app_data_dir).ok();
    app_data_dir.join("settings.json")
}

#[tauri::command]
pub async fn check_ollama_status(ollama_url: String) -> OllamaStatus {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .ok();

    let Some(client) = client else {
        return OllamaStatus {
            connected: false,
            models: vec![],
            error: Some("Failed to create HTTP client".to_string()),
        };
    };

    let url = format!("{}/api/tags", ollama_url);

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<OllamaTagsResponse>().await {
                    Ok(data) => {
                        let models: Vec<String> = data.models.into_iter().map(|m| m.name).collect();
                        OllamaStatus {
                            connected: true,
                            models,
                            error: None,
                        }
                    }
                    Err(e) => OllamaStatus {
                        connected: false,
                        models: vec![],
                        error: Some(format!("Failed to parse response: {}", e)),
                    },
                }
            } else {
                OllamaStatus {
                    connected: false,
                    models: vec![],
                    error: Some(format!("HTTP error: {}", response.status())),
                }
            }
        }
        Err(e) => OllamaStatus {
            connected: false,
            models: vec![],
            error: Some(format!("Connection failed: {}. Is Ollama running?", e)),
        },
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let settings_path = get_settings_path(&app);

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
    let settings_path = get_settings_path(&app);
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, &content).map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
