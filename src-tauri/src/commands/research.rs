use crate::db::{queries, AppDatabase};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

// ─── Domain Types ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Paper {
    pub paper_id: String,
    pub title: String,
    pub abstract_text: Option<String>,
    pub year: Option<i32>,
    pub authors: Vec<String>,
    pub url: String,
    pub citation_count: i32,
    pub venue: Option<String>,
    pub pdf_url: Option<String>,
}

// ─── Semantic Scholar API response shapes ─────────────────────────────────────

#[derive(Debug, Deserialize)]
struct SemanticAuthor {
    name: String,
}

#[derive(Debug, Deserialize)]
struct SemanticPdf {
    url: String,
}

#[derive(Debug, Deserialize)]
struct SemanticPaper {
    #[serde(rename = "paperId")]
    paper_id: Option<String>,
    title: Option<String>,
    #[serde(rename = "abstract")]
    abstract_text: Option<String>,
    year: Option<i32>,
    authors: Option<Vec<SemanticAuthor>>,
    url: Option<String>,
    #[serde(rename = "citationCount")]
    citation_count: Option<i32>,
    venue: Option<String>,
    #[serde(rename = "openAccessPdf")]
    open_access_pdf: Option<SemanticPdf>,
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    data: Vec<SemanticPaper>,
}

// ─── Core search logic ────────────────────────────────────────────────────────

const BASE_URL: &str = "https://api.semanticscholar.org/graph/v1";
const FIELDS: &str = "title,abstract,year,authors,url,citationCount,venue,openAccessPdf";

async fn make_request_with_retry(
    client: &reqwest::Client,
    url: &str,
) -> Result<SearchResponse, String> {
    let send_request = |c: &reqwest::Client, u: &str| c.get(u).send();

    let response = send_request(client, url)
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        // Wait 3 s then retry once
        sleep(Duration::from_secs(3)).await;
        let retry = send_request(client, url)
            .await
            .map_err(|e| format!("Retry request failed: {}", e))?;
        if !retry.status().is_success() {
            return Err(format!("API error after retry: {}", retry.status()));
        }
        return retry
            .json::<SearchResponse>()
            .await
            .map_err(|e| format!("Failed to parse retry response: {}", e));
    }

    if !response.status().is_success() {
        return Err(format!("Semantic Scholar API error: {}", response.status()));
    }

    response
        .json::<SearchResponse>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

async fn search_papers(keywords: Vec<String>, limit: usize) -> Result<Vec<Paper>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut seen: std::collections::HashMap<String, Paper> = std::collections::HashMap::new();

    for keyword in &keywords {
        let trimmed = keyword.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Use percent-encoding via the `url` crate that reqwest already brings in
        let encoded: String = trimmed
            .chars()
            .flat_map(|c| {
                if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
                    vec![c]
                } else if c == ' ' {
                    vec!['+']
                } else {
                    // percent-encode
                    format!("%{:02X}", c as u32).chars().collect()
                }
            })
            .collect();

        let url = format!(
            "{}/paper/search?query={}&limit=3&fields={}",
            BASE_URL, encoded, FIELDS
        );

        match make_request_with_retry(&client, &url).await {
            Ok(resp) => {
                for paper in resp.data {
                    let paper_id = match paper.paper_id {
                        Some(id) if !id.is_empty() => id,
                        _ => continue,
                    };
                    let title = match paper.title {
                        Some(t) if !t.is_empty() => t,
                        _ => continue,
                    };

                    if seen.contains_key(&paper_id) {
                        continue;
                    }

                    let authors: Vec<String> = paper
                        .authors
                        .unwrap_or_default()
                        .into_iter()
                        .map(|a| a.name)
                        .collect();

                    let paper_url = paper.url.unwrap_or_else(|| {
                        format!("https://www.semanticscholar.org/paper/{}", paper_id)
                    });

                    let pdf_url = paper.open_access_pdf.map(|p| p.url);

                    seen.insert(
                        paper_id.clone(),
                        Paper {
                            paper_id,
                            title,
                            abstract_text: paper.abstract_text,
                            year: paper.year,
                            authors,
                            url: paper_url,
                            citation_count: paper.citation_count.unwrap_or(0),
                            venue: paper.venue.filter(|v| !v.is_empty()),
                            pdf_url,
                        },
                    );
                }
            }
            Err(e) => {
                // Log the error but continue with other keywords
                eprintln!("Semantic Scholar search failed for '{}': {}", trimmed, e);
            }
        }

        // Small delay between keyword queries to respect rate limits
        sleep(Duration::from_millis(300)).await;
    }

    let mut papers: Vec<Paper> = seen.into_values().collect();
    // Sort descending by citation count (most-cited first)
    papers.sort_by(|a, b| b.citation_count.cmp(&a.citation_count));
    papers.truncate(limit);
    Ok(papers)
}

// ─── Tauri Commands ───────────────────────────────────────────────────────────

/// Search Semantic Scholar for papers related to this lecture.
///
/// Reads the keywords saved after the pipeline's keyword-extraction stage,
/// queries the API, persists results, and returns them to the frontend.
#[tauri::command]
pub async fn search_related_papers(
    app: AppHandle,
    lecture_id: String,
) -> Result<Vec<Paper>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    // Fetch keywords that the pipeline stored for this lecture
    let keywords = {
        let conn = db.connect().map_err(|e| e.to_string())?;
        queries::get_lecture_keywords(&conn, &lecture_id).map_err(|e| e.to_string())?
    };

    if keywords.is_empty() {
        return Err("No keywords found for this lecture. Run the pipeline first.".to_string());
    }

    let papers = search_papers(keywords, 10).await?;

    // Persist so we can reload without another network call
    {
        let conn = db.connect().map_err(|e| e.to_string())?;
        let papers_json = serde_json::to_string(&papers)
            .map_err(|e| format!("Failed to serialise papers: {}", e))?;
        queries::upsert_papers(&conn, &lecture_id, &papers_json).map_err(|e| e.to_string())?;
    }

    Ok(papers)
}

/// Return previously-saved research papers for a lecture.
#[tauri::command]
pub async fn get_lecture_papers(
    app: AppHandle,
    lecture_id: String,
) -> Result<Option<Vec<Paper>>, String> {
    let db = app
        .try_state::<AppDatabase>()
        .ok_or_else(|| "Database not initialised".to_string())?;

    let conn = db.connect().map_err(|e| e.to_string())?;
    let json = queries::get_papers(&conn, &lecture_id).map_err(|e| e.to_string())?;

    match json {
        Some(j) => {
            let papers: Vec<Paper> = serde_json::from_str(&j)
                .map_err(|e| format!("Failed to deserialise papers: {}", e))?;
            Ok(Some(papers))
        }
        None => Ok(None),
    }
}
