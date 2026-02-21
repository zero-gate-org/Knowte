use crate::db::queries::{
    delete_lecture as delete_lecture_record, get_flashcards, get_lecture_by_id, get_mindmap,
    get_notes, get_quiz, get_transcript_by_lecture_id, list_lectures as list_lecture_records,
    search_lectures as search_lecture_records, LectureSummaryRecord,
};
use crate::db::AppDatabase;
use crate::models::{FlashcardsOutput, MindMapData, MindMapNode};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use thiserror::Error;

#[derive(Debug, Clone, Serialize)]
pub struct LectureSummary {
    pub id: String,
    pub title: String,
    pub filename: String,
    pub duration: f64,
    pub status: String,
    pub created_at: String,
    pub audio_path: String,
    pub summary: Option<String>,
    pub stages_complete: i64,
}

impl From<LectureSummaryRecord> for LectureSummary {
    fn from(record: LectureSummaryRecord) -> Self {
        Self {
            id: record.id,
            title: record.title,
            filename: record.filename,
            duration: record.duration,
            status: record.status,
            created_at: record.created_at,
            audio_path: record.audio_path,
            summary: record.summary,
            stages_complete: record.stages_complete,
        }
    }
}

#[derive(Debug, Error)]
enum LibraryError {
    #[error("Database not initialised.")]
    DatabaseNotInitialised,
    #[error("Unable to access lecture data.")]
    DatabaseUnavailable,
    #[error("Lecture not found.")]
    LectureNotFound,
    #[error("Unable to delete the lecture audio file.")]
    AudioDeleteFailed,
    #[error("Output directory does not exist.")]
    OutputDirectoryMissing,
    #[error("Output path is not a directory.")]
    OutputDirectoryInvalid,
    #[error("Unable to create export folder.")]
    ExportFolderCreateFailed,
    #[error("Unable to write exported files.")]
    ExportWriteFailed,
    #[error("Unable to parse stored notes.")]
    NotesParseFailed,
    #[error("Unable to parse stored flashcards.")]
    FlashcardsParseFailed,
    #[error("Unable to parse stored mind map.")]
    MindmapParseFailed,
}

impl From<LibraryError> for String {
    fn from(value: LibraryError) -> Self {
        value.to_string()
    }
}

#[derive(Deserialize, Default)]
struct NotesTopic {
    #[serde(default)]
    heading: String,
    #[serde(default)]
    key_points: Vec<String>,
    #[serde(default)]
    details: String,
    #[serde(default)]
    examples: Vec<String>,
}

#[derive(Deserialize, Default)]
struct NotesTerm {
    #[serde(default)]
    term: String,
    #[serde(default)]
    definition: String,
}

#[derive(Deserialize, Default)]
struct NotesDocument {
    #[serde(default)]
    title: String,
    #[serde(default)]
    topics: Vec<NotesTopic>,
    #[serde(default)]
    key_terms: Vec<NotesTerm>,
    #[serde(default)]
    takeaways: Vec<String>,
}

#[derive(Clone)]
struct SvgNode {
    label: String,
    x: f32,
    y: f32,
    parent: Option<usize>,
}

#[tauri::command]
pub fn list_lectures(app: AppHandle) -> Result<Vec<LectureSummary>, String> {
    list_lectures_impl(&app).map_err(Into::into)
}

#[tauri::command]
pub fn search_lectures(app: AppHandle, query: String) -> Result<Vec<LectureSummary>, String> {
    search_lectures_impl(&app, &query).map_err(Into::into)
}

#[tauri::command]
pub fn delete_lecture(app: AppHandle, lecture_id: String) -> Result<(), String> {
    delete_lecture_impl(&app, &lecture_id).map_err(Into::into)
}

#[tauri::command]
pub fn export_all_lecture_data(
    app: AppHandle,
    lecture_id: String,
    output_dir: String,
) -> Result<String, String> {
    export_all_lecture_data_impl(&app, &lecture_id, &output_dir).map_err(Into::into)
}

fn list_lectures_impl(app: &AppHandle) -> Result<Vec<LectureSummary>, LibraryError> {
    let database = app
        .try_state::<AppDatabase>()
        .ok_or(LibraryError::DatabaseNotInitialised)?;
    let connection = database
        .connect()
        .map_err(|_| LibraryError::DatabaseUnavailable)?;
    let records =
        list_lecture_records(&connection).map_err(|_| LibraryError::DatabaseUnavailable)?;
    Ok(records.into_iter().map(LectureSummary::from).collect())
}

fn search_lectures_impl(app: &AppHandle, query: &str) -> Result<Vec<LectureSummary>, LibraryError> {
    let database = app
        .try_state::<AppDatabase>()
        .ok_or(LibraryError::DatabaseNotInitialised)?;
    let connection = database
        .connect()
        .map_err(|_| LibraryError::DatabaseUnavailable)?;
    let records = search_lecture_records(&connection, query)
        .map_err(|_| LibraryError::DatabaseUnavailable)?;
    Ok(records.into_iter().map(LectureSummary::from).collect())
}

fn delete_lecture_impl(app: &AppHandle, lecture_id: &str) -> Result<(), LibraryError> {
    let database = app
        .try_state::<AppDatabase>()
        .ok_or(LibraryError::DatabaseNotInitialised)?;
    let connection = database
        .connect()
        .map_err(|_| LibraryError::DatabaseUnavailable)?;

    let lecture = get_lecture_by_id(&connection, lecture_id)
        .map_err(|_| LibraryError::DatabaseUnavailable)?
        .ok_or(LibraryError::LectureNotFound)?;

    let audio_path = PathBuf::from(&lecture.audio_path);
    if audio_path.exists() {
        fs::remove_file(audio_path).map_err(|_| LibraryError::AudioDeleteFailed)?;
    }

    delete_lecture_record(&connection, lecture_id)
        .map_err(|_| LibraryError::DatabaseUnavailable)?;
    Ok(())
}

fn export_all_lecture_data_impl(
    app: &AppHandle,
    lecture_id: &str,
    output_dir: &str,
) -> Result<String, LibraryError> {
    let database = app
        .try_state::<AppDatabase>()
        .ok_or(LibraryError::DatabaseNotInitialised)?;
    let connection = database
        .connect()
        .map_err(|_| LibraryError::DatabaseUnavailable)?;

    let lecture = get_lecture_by_id(&connection, lecture_id)
        .map_err(|_| LibraryError::DatabaseUnavailable)?
        .ok_or(LibraryError::LectureNotFound)?;

    let output_base = PathBuf::from(output_dir);
    if !output_base.exists() {
        return Err(LibraryError::OutputDirectoryMissing);
    }
    if !output_base.is_dir() {
        return Err(LibraryError::OutputDirectoryInvalid);
    }

    let folder_name = format!(
        "{}-{}",
        sanitize_folder_name(&lecture.filename),
        &lecture_id.chars().take(8).collect::<String>()
    );
    let export_dir = output_base.join(folder_name);
    fs::create_dir_all(&export_dir).map_err(|_| LibraryError::ExportFolderCreateFailed)?;

    if let Some(transcript) = get_transcript_by_lecture_id(&connection, lecture_id)
        .map_err(|_| LibraryError::DatabaseUnavailable)?
    {
        let markdown = format!(
            "# Transcript\n\n**Lecture:** {}\n\n{}",
            lecture.filename,
            transcript.full_text.trim()
        );
        write_export_file(&export_dir.join("transcript.md"), &markdown)?;
    }

    if let Some(notes_json) =
        get_notes(&connection, lecture_id).map_err(|_| LibraryError::DatabaseUnavailable)?
    {
        let markdown = notes_to_markdown(&notes_json)?;
        write_export_file(&export_dir.join("notes.md"), &markdown)?;
    }

    if let Some(quiz_json) =
        get_quiz(&connection, lecture_id).map_err(|_| LibraryError::DatabaseUnavailable)?
    {
        let quiz_pretty = serde_json::from_str::<serde_json::Value>(&quiz_json)
            .ok()
            .and_then(|value| serde_json::to_string_pretty(&value).ok())
            .unwrap_or(quiz_json);
        write_export_file(&export_dir.join("quiz.json"), &quiz_pretty)?;
    }

    if let Some(flashcards_json) =
        get_flashcards(&connection, lecture_id).map_err(|_| LibraryError::DatabaseUnavailable)?
    {
        let flashcards_tsv = flashcards_to_tsv(&flashcards_json)?;
        write_export_file(&export_dir.join("flashcards.txt"), &flashcards_tsv)?;
    }

    if let Some(mindmap_json) =
        get_mindmap(&connection, lecture_id).map_err(|_| LibraryError::DatabaseUnavailable)?
    {
        let mindmap_svg = mindmap_to_svg(&mindmap_json)?;
        write_export_file(&export_dir.join("mindmap.svg"), &mindmap_svg)?;
    }

    Ok(export_dir.to_string_lossy().to_string())
}

fn sanitize_folder_name(filename: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("lecture");

    let mut cleaned = String::with_capacity(stem.len());
    for character in stem.chars() {
        if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
            cleaned.push(character);
        } else {
            cleaned.push('_');
        }
    }

    let compact = cleaned.trim_matches('_');
    if compact.is_empty() {
        "lecture".to_string()
    } else {
        compact.to_string()
    }
}

fn notes_to_markdown(raw: &str) -> Result<String, LibraryError> {
    let notes: NotesDocument =
        serde_json::from_str(raw).map_err(|_| LibraryError::NotesParseFailed)?;

    let title = if notes.title.trim().is_empty() {
        "Lecture Notes"
    } else {
        notes.title.trim()
    };

    let mut markdown = String::new();
    markdown.push_str(&format!("# {title}\n\n"));

    for topic in &notes.topics {
        if topic.heading.trim().is_empty() {
            continue;
        }
        markdown.push_str(&format!("## {}\n\n", topic.heading.trim()));

        if !topic.key_points.is_empty() {
            markdown.push_str("### Key Points\n\n");
            for point in &topic.key_points {
                if !point.trim().is_empty() {
                    markdown.push_str(&format!("- {}\n", point.trim()));
                }
            }
            markdown.push('\n');
        }

        if !topic.details.trim().is_empty() {
            markdown.push_str(topic.details.trim());
            markdown.push_str("\n\n");
        }

        if !topic.examples.is_empty() {
            markdown.push_str("### Examples\n\n");
            for example in &topic.examples {
                if !example.trim().is_empty() {
                    markdown.push_str(&format!("> {}\n\n", example.trim()));
                }
            }
        }
    }

    if !notes.key_terms.is_empty() {
        markdown.push_str("## Key Terms\n\n");
        markdown.push_str("| Term | Definition |\n");
        markdown.push_str("|------|------------|\n");
        for term in &notes.key_terms {
            if term.term.trim().is_empty() && term.definition.trim().is_empty() {
                continue;
            }
            markdown.push_str(&format!(
                "| {} | {} |\n",
                term.term.trim(),
                term.definition.trim()
            ));
        }
        markdown.push('\n');
    }

    if !notes.takeaways.is_empty() {
        markdown.push_str("## Key Takeaways\n\n");
        for (index, takeaway) in notes.takeaways.iter().enumerate() {
            if takeaway.trim().is_empty() {
                continue;
            }
            markdown.push_str(&format!("{}. {}\n", index + 1, takeaway.trim()));
        }
        markdown.push('\n');
    }

    Ok(markdown)
}

fn flashcards_to_tsv(raw: &str) -> Result<String, LibraryError> {
    let flashcards: FlashcardsOutput =
        serde_json::from_str(raw).map_err(|_| LibraryError::FlashcardsParseFailed)?;

    let mut lines = Vec::with_capacity(flashcards.cards.len());
    for card in flashcards.cards {
        let front = sanitize_tsv_field(&card.front);
        let back = sanitize_tsv_field(&card.back);
        let tags = card.tags.join(" ").trim().to_string();
        lines.push(format!("{front}\t{back}\t{tags}"));
    }

    Ok(lines.join("\n"))
}

fn sanitize_tsv_field(value: &str) -> String {
    value
        .replace('\t', " ")
        .replace('\r', "")
        .replace('\n', "<br>")
        .trim()
        .to_string()
}

fn collect_svg_nodes(
    node: &MindMapNode,
    depth: usize,
    parent: Option<usize>,
    nodes: &mut Vec<SvgNode>,
) {
    let index = nodes.len();
    let x = 64.0 + depth as f32 * 220.0;
    let y = 72.0 + index as f32 * 56.0;
    nodes.push(SvgNode {
        label: node.label.clone(),
        x,
        y,
        parent,
    });

    for child in &node.children {
        collect_svg_nodes(child, depth + 1, Some(index), nodes);
    }
}

fn escape_svg_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn mindmap_to_svg(raw: &str) -> Result<String, LibraryError> {
    let mindmap: MindMapData =
        serde_json::from_str(raw).map_err(|_| LibraryError::MindmapParseFailed)?;
    let mut nodes = Vec::new();
    collect_svg_nodes(&mindmap.root, 0, None, &mut nodes);

    let width = 1280.0_f32;
    let height = (nodes.len() as f32 * 56.0 + 120.0).max(240.0);

    let mut svg = String::new();
    svg.push_str(&format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">"#
    ));
    svg.push_str(r##"<rect width="100%" height="100%" fill="#0f172a"/>"##);

    for node in &nodes {
        if let Some(parent_index) = node.parent {
            if let Some(parent) = nodes.get(parent_index) {
                svg.push_str(&format!(
                    r##"<line x1="{:.1}" y1="{:.1}" x2="{:.1}" y2="{:.1}" stroke="#334155" stroke-width="2"/>"##,
                    parent.x + 8.0,
                    parent.y + 22.0,
                    node.x - 8.0,
                    node.y + 22.0
                ));
            }
        }
    }

    for node in &nodes {
        let label = escape_svg_text(node.label.trim());
        svg.push_str(&format!(
            r##"<rect x="{:.1}" y="{:.1}" width="180" height="36" rx="8" fill="#1e293b" stroke="#475569"/>"##,
            node.x,
            node.y
        ));
        svg.push_str(&format!(
            r##"<text x="{:.1}" y="{:.1}" fill="#e2e8f0" font-size="13" font-family="system-ui, sans-serif">{}</text>"##,
            node.x + 10.0,
            node.y + 22.0,
            label
        ));
    }

    svg.push_str("</svg>");
    Ok(svg)
}

fn write_export_file(path: &Path, content: &str) -> Result<(), LibraryError> {
    fs::write(path, content).map_err(|_| LibraryError::ExportWriteFailed)
}
