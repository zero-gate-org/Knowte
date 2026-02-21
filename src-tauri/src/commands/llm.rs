use crate::commands::settings::get_settings;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use thiserror::Error;

// ─── Error Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum LlmError {
    #[error("Ollama is not running at {0}. Please start Ollama and try again.")]
    OllamaNotRunning(String),

    #[error("Model '{0}' is not downloaded. Run `ollama pull {0}` to download it.")]
    ModelNotFound(String),

    #[error("LLM request timed out after 5 minutes. The model may be too slow or the transcript too long.")]
    Timeout,

    #[error("Failed to send request to Ollama: {0}")]
    RequestFailed(String),

    #[error("LLM response did not contain valid JSON after retry.")]
    InvalidJsonResponse,

    #[error("Failed to read settings: {0}")]
    SettingsReadFailed(String),
}

impl From<LlmError> for String {
    fn from(value: LlmError) -> Self {
        value.to_string()
    }
}

// ─── Stream Event ─────────────────────────────────────────────────────────────

/// Emitted as `llm-stream` Tauri event while the LLM generates tokens.
#[derive(Debug, Clone, Serialize)]
pub struct LlmStreamEvent {
    pub lecture_id: String,
    pub stage: String,
    pub token: String,
    pub done: bool,
}

// ─── Internal Ollama Wire Types ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct OllamaStreamChunk {
    response: Option<String>,
    done: Option<bool>,
    error: Option<String>,
}

// ─── Ollama Client ────────────────────────────────────────────────────────────

pub struct OllamaClient {
    base_url: String,
    client: reqwest::Client,
}

impl OllamaClient {
    pub fn new(base_url: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300)) // 5-minute timeout
            .build()
            .unwrap_or_default();
        Self { base_url, client }
    }

    /// Returns `true` when the Ollama server is reachable.
    pub async fn is_available(&self) -> bool {
        let url = format!("{}/api/tags", self.base_url);
        self.client
            .get(&url)
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// Stream a generation request to Ollama.
    ///
    /// Emits `llm-stream` Tauri events as each token arrives, then returns
    /// the full concatenated response string.
    pub async fn generate(
        &self,
        app: &AppHandle,
        model: &str,
        prompt: &str,
        lecture_id: &str,
        stage: &str,
    ) -> Result<String, LlmError> {
        if !self.is_available().await {
            return Err(LlmError::OllamaNotRunning(self.base_url.clone()));
        }

        let url = format!("{}/api/generate", self.base_url);
        let body = serde_json::json!({
            "model": model,
            "prompt": prompt,
            "stream": true,
        });

        let response = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    LlmError::Timeout
                } else {
                    LlmError::RequestFailed(e.to_string())
                }
            })?;

        // HTTP 404 → model not loaded
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Err(LlmError::ModelNotFound(model.to_string()));
        }

        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_default();
            if body_text.to_lowercase().contains("model")
                && body_text.to_lowercase().contains("not found")
            {
                return Err(LlmError::ModelNotFound(model.to_string()));
            }
            return Err(LlmError::RequestFailed(format!(
                "HTTP {}: {}",
                status, body_text
            )));
        }

        let mut accumulated = String::new();
        let mut byte_stream = response.bytes_stream();

        'outer: while let Some(chunk_result) = byte_stream.next().await {
            let bytes = chunk_result.map_err(|e| {
                if e.is_timeout() {
                    LlmError::Timeout
                } else {
                    LlmError::RequestFailed(e.to_string())
                }
            })?;

            let text = String::from_utf8_lossy(&bytes);

            // The Ollama streaming endpoint returns newline-delimited JSON objects.
            for line in text.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }

                match serde_json::from_str::<OllamaStreamChunk>(line) {
                    Ok(chunk) => {
                        // Surface server-side errors embedded in the stream
                        if let Some(err) = chunk.error {
                            if err.to_lowercase().contains("model") {
                                return Err(LlmError::ModelNotFound(model.to_string()));
                            }
                            return Err(LlmError::RequestFailed(err));
                        }

                        let token = chunk.response.unwrap_or_default();
                        let done = chunk.done.unwrap_or(false);

                        accumulated.push_str(&token);

                        // Emit token to frontend
                        let _ = app.emit(
                            "llm-stream",
                            LlmStreamEvent {
                                lecture_id: lecture_id.to_string(),
                                stage: stage.to_string(),
                                token,
                                done,
                            },
                        );

                        if done {
                            break 'outer;
                        }
                    }
                    Err(_) => {
                        // Silently skip lines that don't parse — can happen with
                        // partial chunk boundaries; the loop will retry on the
                        // next bytes chunk.
                    }
                }
            }
        }

        Ok(accumulated)
    }
}

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

/// Extract a JSON object or array from a response that may contain surrounding
/// markdown code fences or prose (e.g. "Here is the JSON: ```json {...} ```").
///
/// Finds the first `{` / `[` and last `}` / `]` and returns that substring.
/// Falls back to returning the original string if nothing is found.
pub fn parse_json_from_response(response: &str) -> String {
    // Prefer object (most LLM outputs are objects)
    let obj = find_json_bounds(response, '{', '}');
    let arr = find_json_bounds(response, '[', ']');

    match (obj, arr) {
        (Some((os, oe)), Some((as_, ae))) => {
            // Pick whichever starts first (closer to front of string)
            if os <= as_ {
                response[os..=oe].to_string()
            } else {
                response[as_..=ae].to_string()
            }
        }
        (Some((s, e)), None) => response[s..=e].to_string(),
        (None, Some((s, e))) => response[s..=e].to_string(),
        (None, None) => response.to_string(),
    }
}

fn find_json_bounds(s: &str, open: char, close: char) -> Option<(usize, usize)> {
    let start = s.find(open)?;
    let end = s.rfind(close)?;
    if end >= start {
        Some((start, end))
    } else {
        None
    }
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Generate a response from an Ollama model with streaming events.
///
/// Parameters
/// ----------
/// * `lecture_id`   — forwarded in every `llm-stream` event so the frontend
///                    can filter for the active lecture.
/// * `stage`        — label for the pipeline stage (e.g. "summary", "notes").
/// * `model`        — Ollama model name; if empty, the model from settings is used.
/// * `prompt`       — the full prompt string to send.
/// * `expect_json`  — when `true`, the function extracts JSON from the response
///                    and retries once with an explicit JSON reminder if the result
///                    is not parseable.
///
/// Returns the (possibly JSON-extracted) response string.
#[tauri::command]
pub async fn generate_llm_response(
    app: AppHandle,
    lecture_id: String,
    stage: String,
    model: String,
    prompt: String,
    expect_json: bool,
) -> Result<String, String> {
    let settings = get_settings(app.clone()).map_err(LlmError::SettingsReadFailed)?;

    let ollama_url = settings.ollama_url.clone();
    let effective_model = if model.is_empty() {
        settings.llm_model.clone()
    } else {
        model.clone()
    };

    let client = OllamaClient::new(ollama_url);

    let raw = client
        .generate(&app, &effective_model, &prompt, &lecture_id, &stage)
        .await
        .map_err(|e: LlmError| e.to_string())?;

    if !expect_json {
        return Ok(raw);
    }

    // Extract JSON from the response
    let extracted = parse_json_from_response(&raw);

    // Validate: if the extracted text is parseable JSON, we're done
    if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        return Ok(extracted);
    }

    // Retry once with an explicit JSON directive appended to the original prompt
    let retry_prompt = format!(
        "{}\n\nIMPORTANT: Please output ONLY valid JSON with no additional text, explanations, or markdown code fences.",
        prompt
    );

    let retry_raw = client
        .generate(
            &app,
            &effective_model,
            &retry_prompt,
            &lecture_id,
            &stage,
        )
        .await
        .map_err(|e: LlmError| e.to_string())?;

    let retry_extracted = parse_json_from_response(&retry_raw);

    if serde_json::from_str::<serde_json::Value>(&retry_extracted).is_ok() {
        Ok(retry_extracted)
    } else {
        Err(LlmError::InvalidJsonResponse.into())
    }
}

/// Quick reachability check — returns `true` when Ollama responds at the
/// configured URL (useful for UI health indicators without a full generation).
#[tauri::command]
pub async fn check_llm_availability(app: AppHandle) -> Result<bool, String> {
    let settings = get_settings(app).map_err(LlmError::SettingsReadFailed)?;
    let client = OllamaClient::new(settings.ollama_url);
    Ok(client.is_available().await)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_json_from_response_plain_object() {
        let input = r#"{"key": "value"}"#;
        assert_eq!(parse_json_from_response(input), r#"{"key": "value"}"#);
    }

    #[test]
    fn test_parse_json_from_response_markdown_fences() {
        let input = "Here is the result:\n```json\n{\"foo\": 1}\n```\nDone.";
        let result = parse_json_from_response(input);
        assert!(result.starts_with('{'));
        assert!(result.ends_with('}'));
        assert!(result.contains("\"foo\""));
    }

    #[test]
    fn test_parse_json_from_response_prose_prefix() {
        let input = "Sure! Here you go: {\"title\": \"Lecture\", \"topics\": []}";
        let result = parse_json_from_response(input);
        assert_eq!(result, "{\"title\": \"Lecture\", \"topics\": []}");
    }

    #[test]
    fn test_parse_json_from_response_array() {
        let input = r#"The keywords are: ["neural networks", "backpropagation"]"#;
        let result = parse_json_from_response(input);
        assert_eq!(result, r#"["neural networks", "backpropagation"]"#);
    }

    #[test]
    fn test_parse_json_from_response_no_json_returns_original() {
        let input = "This is plain text with no JSON.";
        assert_eq!(parse_json_from_response(input), input);
    }

    #[test]
    fn test_parse_json_from_response_object_wins_over_array_when_first() {
        let input = r#"{"root": {"label": "ML", "children": []}}"#;
        let result = parse_json_from_response(input);
        assert!(result.starts_with('{'));
    }
}
