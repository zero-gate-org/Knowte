use crate::commands::llm::{parse_json_from_response, GenerateConfig, OllamaClient};
use crate::commands::settings::get_settings;
use crate::db::{queries, AppDatabase};
use crate::models::{
    Flashcard, FlashcardsOutput, KeywordsOutput, MindMapData, MindMapNode, NotesSupportMaterial,
    NotesTerm, NotesTopic, Question, Quiz, StructuredNotes,
};
use crate::utils::prompt_templates;
use chrono::Utc;
use serde::Serialize;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

// ─── Event Types ──────────────────────────────────────────────────────────────

/// Emitted as `pipeline-stage` Tauri event at the start/end of each stage.
#[derive(Debug, Clone, Serialize)]
pub struct PipelineStageEvent {
    pub lecture_id: String,
    pub stage: String,
    /// "starting" | "complete" | "error"
    pub status: String,
    /// Short excerpt of the result for preview
    pub preview: Option<String>,
    pub error: Option<String>,
    /// 0–6 (0 = not started, 6 = all done)
    pub stages_complete: u32,
}

// ─── Constants ────────────────────────────────────────────────────────────────

/// Approximate chars per token; used for chunking long transcripts.
const CHARS_PER_TOKEN: usize = 4;
/// Maximum tokens per chunk sent to the LLM.
const CHUNK_TOKENS: usize = 4000;
const CHUNK_CHARS: usize = CHUNK_TOKENS * CHARS_PER_TOKEN; // 16 000
const LONG_TRANSCRIPT_WORD_THRESHOLD: usize = 10_000;
const SECTION_TARGET_WORDS: usize = 1_800;
const SECTION_MAX_WORDS: usize = 2_600;
const LONG_CONTEXT_SECTION_SNIPPET_CHARS: usize = 800;
const LONG_CONTEXT_MAX_SECTIONS: usize = 6;
const MAX_MINDMAP_DEPTH: usize = 4;
const MAX_MINDMAP_CHILDREN: usize = 6;

#[derive(Debug, Clone, Copy)]
pub struct PipelineRunOptions {
    pub use_cache: bool,
}

impl Default for PipelineRunOptions {
    fn default() -> Self {
        Self { use_cache: true }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Split `text` into chunks of at most `CHUNK_CHARS` characters, preferring
/// to break on whitespace boundaries.
fn chunk_transcript(text: &str) -> Vec<String> {
    if text.len() <= CHUNK_CHARS {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < text.len() {
        let end = (start + CHUNK_CHARS).min(text.len());

        // Try to break on whitespace so we don't split mid-word.
        let split_at = if end < text.len() {
            text[start..end]
                .rfind(char::is_whitespace)
                .map(|idx| start + idx)
                .unwrap_or(end)
        } else {
            end
        };

        chunks.push(text[start..split_at].to_string());
        start = split_at + 1; // skip the whitespace char
    }

    chunks
}

fn transcript_hash(transcript: &str) -> String {
    let mut hasher = DefaultHasher::new();
    transcript.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn contains_topic_shift_marker(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "next,",
        "moving on",
        "let's move on",
        "let us move on",
        "another topic",
        "new section",
        "in summary",
        "to summarize",
        "in conclusion",
        "on the other hand",
        "now we discuss",
        "now let's discuss",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

pub(crate) fn split_long_transcript_sections(text: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = Vec::new();
    let mut current_words = 0usize;

    let mut units: Vec<String> = text
        .replace("\r\n", "\n")
        .split("\n\n")
        .map(str::trim)
        .filter(|unit| !unit.is_empty())
        .map(ToOwned::to_owned)
        .collect();

    if units.len() < 4 {
        units = text
            .split_terminator(|c: char| matches!(c, '.' | '!' | '?'))
            .map(str::trim)
            .filter(|unit| !unit.is_empty())
            .map(|unit| format!("{unit}."))
            .collect();
    }

    for unit in units {
        let words = unit.split_whitespace().count();
        if words == 0 {
            continue;
        }

        let should_break_for_shift =
            current_words >= SECTION_TARGET_WORDS && contains_topic_shift_marker(&unit);
        let would_exceed_max = current_words + words > SECTION_MAX_WORDS;
        if !current.is_empty() && (should_break_for_shift || would_exceed_max) {
            sections.push(current.join("\n\n"));
            current.clear();
            current_words = 0;
        }

        current.push(unit);
        current_words += words;
    }

    if !current.is_empty() {
        sections.push(current.join("\n\n"));
    }

    if sections.is_empty() {
        vec![text.to_string()]
    } else {
        sections
    }
}

fn normalize_key(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn dedupe_trimmed_strings(values: Vec<String>, max_items: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut output = Vec::new();

    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = normalize_key(trimmed);
        if key.is_empty() || seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        output.push(trimmed.to_string());
        if output.len() >= max_items {
            break;
        }
    }

    output
}

fn section_snapshot(section: &str) -> String {
    let trimmed = collapse_blank_lines(section).replace('\n', " ");
    let snippet = trimmed.trim();
    if snippet.chars().count() <= LONG_CONTEXT_SECTION_SNIPPET_CHARS {
        snippet.to_string()
    } else {
        let cutoff = snippet
            .char_indices()
            .nth(LONG_CONTEXT_SECTION_SNIPPET_CHARS)
            .map(|(index, _)| index)
            .unwrap_or(snippet.len());
        format!("{}…", &snippet[..cutoff])
    }
}

pub(crate) fn build_generation_context(
    summary_text: &str,
    transcript_text: &str,
    long_sections: &[String],
) -> String {
    if long_sections.is_empty() {
        return transcript_text.to_string();
    }

    let mut parts = Vec::new();
    if !summary_text.trim().is_empty() {
        parts.push(format!("LECTURE SUMMARY:\n{}", summary_text.trim()));
    }

    let mut section_summaries = Vec::new();
    for (index, section) in long_sections
        .iter()
        .take(LONG_CONTEXT_MAX_SECTIONS)
        .enumerate()
    {
        section_summaries.push(format!(
            "SECTION {} SNAPSHOT:\n{}",
            index + 1,
            section_snapshot(section)
        ));
    }

    if !section_summaries.is_empty() {
        parts.push(section_summaries.join("\n\n"));
    }

    parts.join("\n\n")
}

pub(crate) fn build_keywords_source(
    summary_text: &str,
    notes_json: Option<&str>,
    transcript_text: &str,
) -> String {
    let mut parts = Vec::new();
    if !summary_text.trim().is_empty() {
        parts.push(format!("LECTURE SUMMARY:\n{}", summary_text.trim()));
    }
    if let Some(notes_json) = notes_json.filter(|value| !value.trim().is_empty()) {
        parts.push(format!("STRUCTURED NOTES JSON:\n{notes_json}"));
    }
    if parts.is_empty() {
        transcript_text.to_string()
    } else {
        parts.join("\n\n")
    }
}

pub(crate) fn build_mindmap_source(
    summary_text: &str,
    notes_json: Option<&str>,
    fallback_context: &str,
) -> String {
    let mut parts = Vec::new();
    if !summary_text.trim().is_empty() {
        parts.push(format!("LECTURE SUMMARY:\n{}", summary_text.trim()));
    }

    if let Some(notes_json) = notes_json.filter(|value| !value.trim().is_empty()) {
        if let Ok(notes) = parse_notes_document(notes_json) {
            let mut outline = Vec::new();
            outline.push(format!("TITLE: {}", notes.title));
            for topic in notes.topics.iter().take(6) {
                outline.push(format!("TOPIC: {}", topic.heading));
                for point in topic.key_points.iter().take(4) {
                    outline.push(format!("  - {}", point));
                }
                for material in topic.support_materials.iter().take(3) {
                    outline.push(format!(
                        "  {}: {}",
                        material.kind.to_uppercase(),
                        material.title
                    ));
                }
            }
            for term in notes.key_terms.iter().take(10) {
                outline.push(format!("TERM: {}", term.term));
            }
            parts.push(format!("NOTES OUTLINE:\n{}", outline.join("\n")));
        }
    }

    if parts.is_empty() {
        fallback_context.to_string()
    } else {
        parts.join("\n\n")
    }
}

fn normalize_question_type(value: &str) -> Option<String> {
    match normalize_key(value).replace(' ', "_").as_str() {
        "multiple_choice" | "multiplechoice" => Some("multiple_choice".to_string()),
        "short_answer" | "shortanswer" => Some("short_answer".to_string()),
        "true_false" | "truefalse" => Some("true_false".to_string()),
        _ => None,
    }
}

fn normalize_difficulty(value: &str) -> String {
    match normalize_key(value).as_str() {
        "easy" => "easy".to_string(),
        "hard" => "hard".to_string(),
        _ => "medium".to_string(),
    }
}

fn contains_case_insensitive(values: &[String], target: &str) -> bool {
    let target_key = normalize_key(target);
    values
        .iter()
        .any(|value| normalize_key(value) == target_key)
}

fn parse_notes_document(raw: &str) -> Result<StructuredNotes, String> {
    let mut notes: StructuredNotes =
        serde_json::from_str(raw).map_err(|_| "Unable to parse notes JSON.".to_string())?;

    notes.title = notes.title.trim().to_string();

    let mut seen_topics = HashSet::new();
    notes.topics = notes
        .topics
        .into_iter()
        .filter_map(|topic| {
            let heading = topic.heading.trim().to_string();
            let key = normalize_key(&heading);
            if heading.is_empty() || key.is_empty() || seen_topics.contains(&key) {
                return None;
            }
            seen_topics.insert(key);

            let key_points = dedupe_trimmed_strings(topic.key_points, 8);
            let examples = dedupe_trimmed_strings(topic.examples, 5);
            let details = collapse_blank_lines(topic.details.trim());
            let support_materials = topic
                .support_materials
                .into_iter()
                .filter_map(|item| {
                    let kind = normalize_key(&item.kind);
                    let title = item.title.trim().to_string();
                    let content = collapse_blank_lines(item.content.trim());
                    let language = item
                        .language
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(ToOwned::to_owned);
                    if content.is_empty() {
                        return None;
                    }
                    Some(NotesSupportMaterial {
                        kind: if kind.is_empty() {
                            "reference".to_string()
                        } else {
                            kind.replace(' ', "_")
                        },
                        title: if title.is_empty() {
                            "Support Material".to_string()
                        } else {
                            title
                        },
                        content,
                        language,
                    })
                })
                .take(6)
                .collect::<Vec<_>>();

            if key_points.is_empty()
                && details.is_empty()
                && examples.is_empty()
                && support_materials.is_empty()
            {
                return None;
            }

            Some(NotesTopic {
                heading,
                key_points,
                details,
                examples,
                support_materials,
            })
        })
        .collect();

    let mut seen_terms = HashSet::new();
    notes.key_terms = notes
        .key_terms
        .into_iter()
        .filter_map(|term| {
            let name = term.term.trim().to_string();
            let definition = collapse_blank_lines(term.definition.trim());
            let key = normalize_key(&name);
            if name.is_empty()
                || definition.is_empty()
                || key.is_empty()
                || seen_terms.contains(&key)
            {
                return None;
            }
            seen_terms.insert(key);
            Some(NotesTerm {
                term: name,
                definition,
            })
        })
        .take(18)
        .collect();

    notes.takeaways = dedupe_trimmed_strings(notes.takeaways, 10);

    if notes.title.is_empty() {
        notes.title = notes
            .topics
            .first()
            .map(|topic| format!("{} Notes", topic.heading))
            .unwrap_or_else(|| "Lecture Notes".to_string());
    }

    if notes.topics.is_empty() && notes.key_terms.is_empty() && notes.takeaways.is_empty() {
        return Err("Notes output did not contain any usable study content.".to_string());
    }

    Ok(notes)
}

pub(crate) fn validate_notes_json(raw: &str) -> Result<String, String> {
    let notes = parse_notes_document(raw)?;
    serde_json::to_string(&notes).map_err(|_| "Unable to serialize validated notes.".to_string())
}

fn parse_quiz_questions(raw: &str) -> Result<Vec<Question>, String> {
    let quiz: Quiz =
        serde_json::from_str(raw).map_err(|_| "Unable to parse quiz JSON.".to_string())?;
    let mut seen_questions = HashSet::new();
    let mut validated = Vec::new();

    for question in quiz.questions {
        let question_text = collapse_blank_lines(question.question.trim());
        let question_key = normalize_key(&question_text);
        if question_text.is_empty()
            || question_key.is_empty()
            || seen_questions.contains(&question_key)
        {
            continue;
        }

        let Some(question_type) = normalize_question_type(&question.question_type) else {
            continue;
        };

        let difficulty = normalize_difficulty(&question.difficulty);
        let explanation = collapse_blank_lines(question.explanation.trim());
        let mut correct_answer = question.correct_answer.trim().to_string();
        if correct_answer.is_empty() {
            continue;
        }

        let options = match question_type.as_str() {
            "multiple_choice" => {
                let mut options = dedupe_trimmed_strings(question.options.unwrap_or_default(), 6);
                if !contains_case_insensitive(&options, &correct_answer) {
                    options.push(correct_answer.clone());
                }
                options = dedupe_trimmed_strings(options, 4);
                if options.len() != 4 || !contains_case_insensitive(&options, &correct_answer) {
                    continue;
                }
                if let Some(existing) = options
                    .iter()
                    .find(|option| normalize_key(option) == normalize_key(&correct_answer))
                {
                    correct_answer = existing.clone();
                }
                Some(options)
            }
            "true_false" => {
                correct_answer = match normalize_key(&correct_answer).as_str() {
                    "true" => "True".to_string(),
                    "false" => "False".to_string(),
                    _ => continue,
                };
                Some(vec!["True".to_string(), "False".to_string()])
            }
            "short_answer" => None,
            _ => None,
        };

        seen_questions.insert(question_key);
        validated.push(Question {
            id: 0,
            question_type,
            question: question_text,
            options,
            correct_answer,
            explanation,
            difficulty,
        });
    }

    Ok(validated)
}

fn select_quiz_questions(questions: Vec<Question>) -> Vec<Question> {
    let mut multiple_choice = Vec::new();
    let mut short_answer = Vec::new();
    let mut true_false = Vec::new();

    for question in questions {
        match question.question_type.as_str() {
            "multiple_choice" => multiple_choice.push(question),
            "short_answer" => short_answer.push(question),
            "true_false" => true_false.push(question),
            _ => {}
        }
    }

    let mut selected = Vec::new();
    let targets = [
        ("multiple_choice", 5usize),
        ("short_answer", 3usize),
        ("true_false", 2usize),
    ];

    for (question_type, target) in targets {
        let pool = match question_type {
            "multiple_choice" => &mut multiple_choice,
            "short_answer" => &mut short_answer,
            "true_false" => &mut true_false,
            _ => unreachable!(),
        };

        while selected.len() < 10
            && pool.len() > 0
            && selected
                .iter()
                .filter(|item: &&Question| item.question_type == question_type)
                .count()
                < target
        {
            selected.push(pool.remove(0));
        }
    }

    for pool in [&mut multiple_choice, &mut short_answer, &mut true_false] {
        while selected.len() < 10 && !pool.is_empty() {
            selected.push(pool.remove(0));
        }
    }

    for (index, question) in selected.iter_mut().enumerate() {
        question.id = (index + 1) as i64;
    }

    selected
}

pub(crate) fn validate_quiz_json(raw: &str) -> Result<String, String> {
    let questions = select_quiz_questions(parse_quiz_questions(raw)?);
    if questions.len() != 10 {
        return Err(format!(
            "Quiz output must contain exactly 10 usable questions after validation, found {}.",
            questions.len()
        ));
    }
    serde_json::to_string(&Quiz { questions })
        .map_err(|_| "Unable to serialize validated quiz.".to_string())
}

fn flashcard_score(card: &Flashcard) -> usize {
    let mut score = 0usize;
    if card.front.contains('?') {
        score += 2;
    }
    if card.tags.len() >= 2 {
        score += 1;
    }
    let back_len = card.back.split_whitespace().count();
    if (8..=35).contains(&back_len) {
        score += 2;
    }
    let front_len = card.front.split_whitespace().count();
    if (4..=16).contains(&front_len) {
        score += 1;
    }
    score
}

fn parse_flashcards(raw: &str) -> Result<Vec<Flashcard>, String> {
    let flashcards: FlashcardsOutput =
        serde_json::from_str(raw).map_err(|_| "Unable to parse flashcards JSON.".to_string())?;
    let mut seen = HashSet::new();
    let mut cards = Vec::new();

    for card in flashcards.cards {
        let front = collapse_blank_lines(card.front.trim());
        let back = collapse_blank_lines(card.back.trim());
        if front.is_empty() || back.is_empty() {
            continue;
        }

        let key = format!("{}::{}", normalize_key(&front), normalize_key(&back));
        if key == "::" || seen.contains(&key) {
            continue;
        }

        let tags = dedupe_trimmed_strings(
            card.tags
                .into_iter()
                .filter(|tag| normalize_key(tag) != "lecture" && normalize_key(tag) != "study")
                .collect(),
            4,
        );
        seen.insert(key);
        cards.push(Flashcard { front, back, tags });
    }

    Ok(cards)
}

fn select_flashcards(cards: Vec<Flashcard>) -> Vec<Flashcard> {
    let mut indexed: Vec<(usize, Flashcard)> = cards.into_iter().enumerate().collect();
    indexed.sort_by(|(left_index, left_card), (right_index, right_card)| {
        flashcard_score(right_card)
            .cmp(&flashcard_score(left_card))
            .then_with(|| left_index.cmp(right_index))
    });

    indexed.into_iter().map(|(_, card)| card).take(18).collect()
}

pub(crate) fn validate_flashcards_json(raw: &str) -> Result<String, String> {
    let cards = select_flashcards(parse_flashcards(raw)?);
    if cards.len() < 8 {
        return Err(format!(
            "Flashcard output must contain at least 8 usable cards after validation, found {}.",
            cards.len()
        ));
    }
    serde_json::to_string(&FlashcardsOutput { cards })
        .map_err(|_| "Unable to serialize validated flashcards.".to_string())
}

fn sanitize_mindmap_node(node: MindMapNode, depth: usize) -> Option<MindMapNode> {
    let label = node.label.trim().to_string();
    if label.is_empty() {
        return None;
    }

    if depth >= MAX_MINDMAP_DEPTH {
        return Some(MindMapNode {
            label,
            children: Vec::new(),
        });
    }

    let mut seen = HashSet::new();
    let mut children = Vec::new();
    for child in node.children {
        let Some(clean_child) = sanitize_mindmap_node(child, depth + 1) else {
            continue;
        };
        let key = normalize_key(&clean_child.label);
        if key.is_empty() || seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        children.push(clean_child);
        if children.len() >= MAX_MINDMAP_CHILDREN {
            break;
        }
    }

    Some(MindMapNode { label, children })
}

pub(crate) fn validate_mindmap_json(raw: &str) -> Result<String, String> {
    let mindmap: MindMapData =
        serde_json::from_str(raw).map_err(|_| "Unable to parse mind map JSON.".to_string())?;
    let root = sanitize_mindmap_node(mindmap.root, 0)
        .ok_or_else(|| "Mind map root label was empty after validation.".to_string())?;
    serde_json::to_string(&MindMapData { root })
        .map_err(|_| "Unable to serialize validated mind map.".to_string())
}

pub(crate) fn validate_keywords_json(raw: &str) -> Result<String, String> {
    let keywords: KeywordsOutput =
        serde_json::from_str(raw).map_err(|_| "Unable to parse keywords JSON.".to_string())?;
    let banned = [
        "lecture",
        "lectures",
        "research",
        "study",
        "important concept",
        "topic",
        "topics",
    ];

    let mut clean_keywords = Vec::new();
    let mut seen = HashSet::new();
    for keyword in keywords.keywords {
        let trimmed = keyword.trim();
        let key = normalize_key(trimmed);
        if trimmed.len() < 3
            || key.is_empty()
            || banned.iter().any(|item| *item == key)
            || seen.contains(&key)
        {
            continue;
        }
        seen.insert(key);
        clean_keywords.push(trimmed.to_string());
        if clean_keywords.len() >= 10 {
            break;
        }
    }

    if clean_keywords.len() < 4 {
        return Err(format!(
            "Keyword output must contain at least 4 usable search terms after validation, found {}.",
            clean_keywords.len()
        ));
    }

    serde_json::to_string(&KeywordsOutput {
        keywords: clean_keywords,
    })
    .map_err(|_| "Unable to serialize validated keywords.".to_string())
}

pub(crate) async fn run_json_stage(
    client: &OllamaClient,
    app: &AppHandle,
    model: &str,
    prompt: &str,
    lecture_id: &str,
    stage: &str,
    schema: Option<serde_json::Value>,
    validator: fn(&str) -> Result<String, String>,
) -> Result<String, String> {
    let config = GenerateConfig {
        system: None,
        format: schema,
        temperature: Some(0.0),
        stream: true,
    };

    let raw = client
        .generate_with_config(app, model, prompt, lecture_id, stage, &config)
        .await
        .map_err(|e| e.to_string())?;
    let extracted = parse_json_from_response(&raw);

    match validator(&extracted) {
        Ok(valid) => Ok(valid),
        Err(validation_error) => {
            let repair_prompt = format!(
                "{prompt}\n\nThe previous JSON was invalid for these reasons:\n- {validation_error}\n\nReturn corrected JSON only. Preserve valid content, remove unsupported items, and do not add commentary."
            );
            let retry_raw = client
                .generate_with_config(app, model, &repair_prompt, lecture_id, stage, &config)
                .await
                .map_err(|e| e.to_string())?;
            let retry_extracted = parse_json_from_response(&retry_raw);
            validator(&retry_extracted)
        }
    }
}

pub(crate) fn merge_notes_sections(section_jsons: &[String]) -> Result<String, String> {
    let mut title = String::new();
    let mut topics: Vec<serde_json::Value> = Vec::new();
    let mut key_terms: Vec<serde_json::Value> = Vec::new();
    let mut takeaways: Vec<String> = Vec::new();
    let mut seen_terms: HashSet<String> = HashSet::new();
    let mut seen_takeaways: HashSet<String> = HashSet::new();

    for section in section_jsons {
        let value: serde_json::Value =
            serde_json::from_str(section).map_err(|_| "Unable to parse notes section JSON.")?;
        if title.is_empty() {
            title = value
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
        }

        if let Some(section_topics) = value.get("topics").and_then(serde_json::Value::as_array) {
            topics.extend(section_topics.iter().cloned());
        }

        if let Some(section_terms) = value.get("key_terms").and_then(serde_json::Value::as_array) {
            for term in section_terms {
                let key = term
                    .get("term")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase();
                if key.is_empty() || seen_terms.contains(&key) {
                    continue;
                }
                seen_terms.insert(key);
                key_terms.push(term.clone());
            }
        }

        if let Some(section_takeaways) =
            value.get("takeaways").and_then(serde_json::Value::as_array)
        {
            for takeaway in section_takeaways {
                let text = takeaway.as_str().unwrap_or_default().trim();
                if text.is_empty() {
                    continue;
                }
                let key = text.to_ascii_lowercase();
                if seen_takeaways.contains(&key) {
                    continue;
                }
                seen_takeaways.insert(key);
                takeaways.push(text.to_string());
            }
        }
    }

    if title.is_empty() {
        title = "Structured Lecture Notes".to_string();
    }

    let merged = serde_json::to_string(&serde_json::json!({
        "title": title,
        "topics": topics,
        "key_terms": key_terms,
        "takeaways": takeaways,
    }))
    .map_err(|_| "Unable to serialize merged notes.".to_string())?;

    validate_notes_json(&merged)
}

pub(crate) fn merge_quiz_sections(section_jsons: &[String]) -> Result<String, String> {
    let mut questions = Vec::new();

    for section in section_jsons {
        questions.extend(parse_quiz_questions(section)?);
    }

    let quiz = Quiz {
        questions: select_quiz_questions(questions),
    };

    validate_quiz_json(
        &serde_json::to_string(&quiz)
            .map_err(|_| "Unable to serialize merged quiz.".to_string())?,
    )
}

pub(crate) fn merge_flashcards_sections(section_jsons: &[String]) -> Result<String, String> {
    let mut cards = Vec::new();
    for section in section_jsons {
        cards.extend(parse_flashcards(section)?);
    }

    let flashcards = FlashcardsOutput {
        cards: select_flashcards(cards),
    };

    validate_flashcards_json(
        &serde_json::to_string(&flashcards)
            .map_err(|_| "Unable to serialize merged flashcards.".to_string())?,
    )
}

/// Build a short preview from an LLM response (first 200 chars).
fn make_preview(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.chars().count() > 200 {
        // Find the byte index of the 200th character to avoid splitting multi-byte chars
        let cutoff = trimmed
            .char_indices()
            .nth(200)
            .map(|(i, _)| i)
            .unwrap_or(trimmed.len());
        format!("{}…", &trimmed[..cutoff])
    } else {
        trimmed.to_string()
    }
}

fn find_first_index(haystack: &str, needles: &[&str]) -> Option<usize> {
    needles
        .iter()
        .filter_map(|needle| haystack.find(needle))
        .min()
}

fn collapse_blank_lines(text: &str) -> String {
    let mut lines = Vec::new();
    let mut previous_blank = true;

    for line in text.lines() {
        let trimmed_end = line.trim_end();
        let is_blank = trimmed_end.trim().is_empty();
        if is_blank {
            if previous_blank {
                continue;
            }
            lines.push(String::new());
            previous_blank = true;
        } else {
            lines.push(trimmed_end.to_string());
            previous_blank = false;
        }
    }

    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }

    lines.join("\n")
}

fn normalise_summary_lead_in(value: &str) -> String {
    value.trim().replace(['’', '`'], "'").to_ascii_lowercase()
}

fn trim_courtesy_prefix(value: &str) -> String {
    let mut current = normalise_summary_lead_in(value);

    for prefix in [
        "okay,",
        "okay",
        "sure,",
        "sure",
        "certainly,",
        "certainly",
        "of course,",
    ] {
        if current.starts_with(prefix) {
            current = current[prefix.len()..].trim_start().to_string();
            break;
        }
    }

    current
}

fn is_summary_lead_in(line: &str) -> bool {
    let mut current = trim_courtesy_prefix(line);

    if current.starts_with("here's ") {
        current = current["here's ".len()..].to_string();
    } else if current.starts_with("here is ") {
        current = current["here is ".len()..].to_string();
    } else {
        return false;
    }

    for prefix in ["a ", "the "] {
        if current.starts_with(prefix) {
            current = current[prefix.len()..].to_string();
            break;
        }
    }

    for prefix in ["concise ", "brief ", "short ", "quick "] {
        if current.starts_with(prefix) {
            current = current[prefix.len()..].to_string();
            break;
        }
    }

    if !current.starts_with("summary") {
        return false;
    }

    matches!(
        current["summary".len()..].trim(),
        "" | ":"
            | "-"
            | "of the lecture"
            | "of the lecture:"
            | "of this lecture"
            | "of this lecture:"
            | "for the lecture"
            | "for the lecture:"
            | "for this lecture"
            | "for this lecture:"
    )
}

fn strip_leading_summary_lead_in(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let Some(first_content_index) = lines.iter().position(|line| !line.trim().is_empty()) else {
        return text.to_string();
    };

    let first_line = lines[first_content_index].trim();
    if !is_summary_lead_in(first_line) {
        return text.to_string();
    }

    if let Some((_, trailing)) = first_line.split_once(':') {
        if !trailing.trim().is_empty() {
            let mut rebuilt = Vec::with_capacity(lines.len());
            rebuilt.extend(lines[..first_content_index].iter().copied());
            rebuilt.push(trailing.trim());
            rebuilt.extend(lines[first_content_index + 1..].iter().copied());
            return rebuilt.join("\n").trim().to_string();
        }
    }

    let mut next_index = first_content_index + 1;
    while next_index < lines.len() && lines[next_index].trim().is_empty() {
        next_index += 1;
    }

    lines[next_index..].join("\n").trim().to_string()
}

fn sanitize_summary_text(raw: &str) -> String {
    let fallback = raw.trim();
    if fallback.is_empty() {
        return String::new();
    }

    let mut text = raw
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .filter(|line| !line.trim_start().starts_with("```"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if text.is_empty() {
        return fallback.to_string();
    }

    text = strip_leading_summary_lead_in(&text);
    if text.is_empty() {
        return fallback.to_string();
    }

    // Remove known "extra assistant" sections that should not be in final notes.
    let lower = text.to_ascii_lowercase();
    if let Some(cut_at) = find_first_index(
        &lower,
        &[
            "\n**rationale",
            "\nrationale for language",
            "\nrationale:",
            "\nwould you like",
            "\nlet me know if you'd like",
            "\ni can also",
            "\nif you'd like",
        ],
    ) {
        text = text[..cut_at].trim_end().to_string();
    }

    // If the model appended a follow-up prompt inline, trim it from the tail.
    let lower = text.to_ascii_lowercase();
    for marker in [
        "would you like",
        "let me know if you'd like",
        "if you'd like,",
        "i can also",
    ] {
        if let Some(idx) = lower.find(marker) {
            if idx >= lower.len() / 2 {
                text = text[..idx].trim_end().to_string();
                break;
            }
        }
    }

    // If there's a conversational preface before a clear content marker,
    // discard the preface and keep the actual summary body.
    let lower = text.to_ascii_lowercase();
    let mut content_markers: Vec<usize> = Vec::new();
    for marker in ["**thesis:**", "thesis:", "## ", "### ", "#### "] {
        if let Some(idx) = lower.find(marker) {
            content_markers.push(idx);
        }
    }
    for marker in ["- ", "* ", "1. ", "1) "] {
        if lower.starts_with(marker) {
            content_markers.push(0);
        }
        let line_start_marker = format!("\n{marker}");
        if let Some(idx) = lower.find(&line_start_marker) {
            content_markers.push(idx + 1);
        }
    }

    if let Some(start_idx) = content_markers.into_iter().min() {
        if start_idx > 0 && start_idx < 700 {
            let prefix = lower[..start_idx].trim();
            let likely_preface = prefix.starts_with("okay")
                || prefix.starts_with("sure")
                || prefix.starts_with("certainly")
                || prefix.starts_with("of course")
                || prefix.contains("here's")
                || prefix.contains("here is")
                || prefix.contains("here’s")
                || prefix.contains("summary");
            if likely_preface {
                text = text[start_idx..].trim_start().to_string();
            }
        }
    }

    let text = collapse_blank_lines(
        text.trim_end_matches(|ch: char| ch == '-' || ch.is_whitespace())
            .trim_end(),
    );

    if text.is_empty() {
        fallback.to_string()
    } else {
        text
    }
}

// ─── Stage executor ───────────────────────────────────────────────────────────

/// Execute a single LLM stage.  
/// Returns `(llm_output_string, is_json_valid)`.
async fn run_stage(
    client: &OllamaClient,
    app: &AppHandle,
    model: &str,
    prompt: &str,
    lecture_id: &str,
    stage: &str,
    expect_json: bool,
) -> Result<String, String> {
    let mut raw = client
        .generate_with_config(
            app,
            model,
            prompt,
            lecture_id,
            stage,
            &GenerateConfig {
                system: None,
                temperature: Some(if expect_json { 0.0 } else { 0.2 }),
                stream: true,
                ..GenerateConfig::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    if !expect_json {
        return Ok(raw);
    }

    let extracted = parse_json_from_response(&raw);
    raw.clear();
    raw.shrink_to_fit();

    if serde_json::from_str::<serde_json::Value>(&extracted).is_ok() {
        return Ok(extracted);
    }

    // Retry once with an explicit JSON directive
    let retry_prompt = format!(
        "{}\n\nIMPORTANT: Output ONLY valid JSON with no additional text or markdown fences.",
        prompt
    );
    let mut retry_raw = client
        .generate_with_config(
            app,
            model,
            &retry_prompt,
            lecture_id,
            stage,
            &GenerateConfig {
                system: None,
                temperature: Some(0.0),
                stream: true,
                ..GenerateConfig::default()
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    let retry_extracted = parse_json_from_response(&retry_raw);
    retry_raw.clear();
    retry_raw.shrink_to_fit();

    if serde_json::from_str::<serde_json::Value>(&retry_extracted).is_ok() {
        Ok(retry_extracted)
    } else {
        Err("LLM did not return valid JSON after retry.".to_string())
    }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

fn mark_stage_starting(db: &AppDatabase, lecture_id: &str, stage_name: &str) {
    if let Ok(conn) = db.connect() {
        let record = queries::PipelineStageRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.to_string(),
            stage_name: stage_name.to_string(),
            status: "running".to_string(),
            result_preview: None,
            error: None,
            started_at: Some(Utc::now().to_rfc3339()),
            completed_at: None,
        };
        let _ = queries::upsert_pipeline_stage(&conn, &record);
    }
}

fn mark_stage_complete(db: &AppDatabase, lecture_id: &str, stage_name: &str, preview: &str) {
    if let Ok(conn) = db.connect() {
        let record = queries::PipelineStageRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.to_string(),
            stage_name: stage_name.to_string(),
            status: "complete".to_string(),
            result_preview: Some(preview.to_string()),
            error: None,
            started_at: None,
            completed_at: Some(Utc::now().to_rfc3339()),
        };
        let _ = queries::upsert_pipeline_stage(&conn, &record);
    }
}

fn mark_stage_error(db: &AppDatabase, lecture_id: &str, stage_name: &str, error: &str) {
    if let Ok(conn) = db.connect() {
        let record = queries::PipelineStageRecord {
            id: Uuid::new_v4().to_string(),
            lecture_id: lecture_id.to_string(),
            stage_name: stage_name.to_string(),
            status: "error".to_string(),
            result_preview: None,
            error: Some(error.to_string()),
            started_at: None,
            completed_at: Some(Utc::now().to_rfc3339()),
        };
        let _ = queries::upsert_pipeline_stage(&conn, &record);
    }
}

fn load_cached_stage_result(
    db: &AppDatabase,
    lecture_id: &str,
    stage_name: &str,
    transcript_hash: &str,
) -> Option<String> {
    let conn = db.connect().ok()?;
    queries::get_llm_stage_cache(&conn, lecture_id, stage_name, transcript_hash)
        .ok()
        .flatten()
}

fn store_cached_stage_result(
    db: &AppDatabase,
    lecture_id: &str,
    stage_name: &str,
    transcript_hash: &str,
    result_text: &str,
) {
    if let Ok(conn) = db.connect() {
        let _ = queries::upsert_llm_stage_cache(
            &conn,
            lecture_id,
            stage_name,
            transcript_hash,
            result_text,
        );
    }
}

fn emit_stage(
    app: &AppHandle,
    lecture_id: &str,
    stage: &str,
    status: &str,
    preview: Option<String>,
    error: Option<String>,
    stages_complete: u32,
) {
    let _ = app.emit(
        "pipeline-stage",
        PipelineStageEvent {
            lecture_id: lecture_id.to_string(),
            stage: stage.to_string(),
            status: status.to_string(),
            preview,
            error,
            stages_complete,
        },
    );
}

fn cleanup_audio_after_processing(app: &AppHandle, db: &AppDatabase, lecture_id: &str) {
    let lecture_audio_path = if let Ok(conn) = db.connect() {
        queries::get_lecture_by_id(&conn, lecture_id)
            .ok()
            .flatten()
            .map(|lecture| lecture.audio_path)
    } else {
        None
    };

    if let Some(audio_path) = lecture_audio_path {
        let _ = std::fs::remove_file(audio_path);
    }

    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let prepared = app_data_dir
            .join("prepared-audio")
            .join(format!("{lecture_id}-16khz-mono.wav"));
        let _ = std::fs::remove_file(prepared);
    }
}

// ─── Public Entry Point ───────────────────────────────────────────────────────

/// Run all 6 pipeline stages for a lecture, persisting results and emitting
/// real-time `pipeline-stage` events.  Designed to be spawned in a background
/// task so it does not block the Tauri main thread.
pub async fn run_full_pipeline(lecture_id: String, app: AppHandle) {
    run_full_pipeline_with_options(lecture_id, app, PipelineRunOptions::default()).await;
}

pub async fn run_full_pipeline_with_options(
    lecture_id: String,
    app: AppHandle,
    options: PipelineRunOptions,
) {
    let db = match app.try_state::<AppDatabase>() {
        Some(db) => db.inner().clone(),
        None => {
            eprintln!("[pipeline] AppDatabase not managed — cannot run pipeline.");
            return;
        }
    };

    // ── Load transcript ──────────────────────────────────────────────────────
    let transcript_text = {
        let conn = match db.connect() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[pipeline] DB connect failed: {e}");
                return;
            }
        };
        match queries::get_transcript_by_lecture_id(&conn, &lecture_id) {
            Ok(Some(r)) => r.full_text,
            Ok(None) => {
                eprintln!("[pipeline] No transcript found for lecture {lecture_id}");
                return;
            }
            Err(e) => {
                eprintln!("[pipeline] Transcript query failed: {e}");
                return;
            }
        }
    };

    let transcript_word_count = transcript_text.split_whitespace().count();
    let transcript_hash = transcript_hash(&transcript_text);
    let should_process_by_section = transcript_word_count > LONG_TRANSCRIPT_WORD_THRESHOLD;
    let long_sections = if should_process_by_section {
        split_long_transcript_sections(&transcript_text)
    } else {
        Vec::new()
    };
    if transcript_word_count < 100 {
        emit_stage(
            &app,
            &lecture_id,
            "pipeline",
            "warning",
            None,
            Some(
                "Transcript has fewer than 100 words, so generated results may be limited."
                    .to_string(),
            ),
            0,
        );
    }

    // ── Load settings ────────────────────────────────────────────────────────
    let settings = match get_settings(app.clone()) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[pipeline] Settings load failed: {e}");
            return;
        }
    };

    let model = settings.llm_model.clone();
    let level = settings.personalization_level.clone();
    let client = OllamaClient::new(settings.ollama_url.clone(), settings.llm_timeout_seconds);

    // Mark lecture as processing
    if let Ok(conn) = db.connect() {
        let _ = queries::update_lecture_status(&conn, &lecture_id, "processing");
    }

    // ── Chunking ─────────────────────────────────────────────────────────────
    let chunks = chunk_transcript(&transcript_text);
    let is_long = chunks.len() > 1;

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1 — Summary
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "summary";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 0);
    mark_stage_starting(&db, &lecture_id, stage);

    let summary_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }

        if is_long {
            // Summarise each chunk, then combine
            let mut chunk_summaries = Vec::new();
            for (i, chunk) in chunks.iter().enumerate() {
                let sub_stage = format!("summary_chunk_{}", i + 1);
                let prompt = prompt_templates::summarize_prompt(chunk, &level);
                let s = run_stage(
                    &client,
                    &app,
                    &model,
                    &prompt,
                    &lecture_id,
                    &sub_stage,
                    false,
                )
                .await?;
                chunk_summaries.push(s);
            }
            // Combine chunk summaries
            let combined = chunk_summaries.join("\n\n---\n\n");
            chunk_summaries.clear();
            let final_prompt = prompt_templates::summarize_prompt(&combined, &level);
            let final_output = run_stage(
                &client,
                &app,
                &model,
                &final_prompt,
                &lecture_id,
                stage,
                false,
            )
            .await?;
            Ok(final_output)
        } else {
            let prompt = prompt_templates::summarize_prompt(&transcript_text, &level);
            run_stage(&client, &app, &model, &prompt, &lecture_id, stage, false).await
        }
    }
    .await;

    let summary_text = match summary_result {
        Ok(text) => {
            let cleaned_summary = sanitize_summary_text(&text);
            let preview = make_preview(&cleaned_summary);
            if let Ok(conn) = db.connect() {
                let _ = queries::update_lecture_summary(&conn, &lecture_id, &cleaned_summary);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &cleaned_summary);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 1);
            cleaned_summary
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 1);
            // Use a trimmed transcript as fallback context for subsequent stages
            transcript_text[..transcript_text.len().min(CHUNK_CHARS)].to_string()
        }
    };

    let context_text = build_generation_context(&summary_text, &transcript_text, &long_sections);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2 — Structured Notes
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "notes";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 1);
    mark_stage_starting(&db, &lecture_id, stage);

    let notes_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }

        if should_process_by_section {
            let mut section_notes = Vec::new();
            let total = long_sections.len();
            for (index, section) in long_sections.iter().enumerate() {
                let sub_stage = format!("notes_section_{}", index + 1);
                emit_stage(&app, &lecture_id, &sub_stage, "starting", None, None, 1);
                let section_context = format!(
                    "LECTURE SUMMARY:\n{summary_text}\n\nSECTION {}/{}:\n{}",
                    index + 1,
                    total,
                    section
                );
                let section_prompt =
                    prompt_templates::structured_notes_prompt(&section_context, &level);
                let section_json = match run_json_stage(
                    &client,
                    &app,
                    &model,
                    &section_prompt,
                    &lecture_id,
                    &sub_stage,
                    Some(prompt_templates::notes_response_schema()),
                    validate_notes_json,
                )
                .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        emit_stage(
                            &app,
                            &lecture_id,
                            &sub_stage,
                            "error",
                            None,
                            Some(error.clone()),
                            1,
                        );
                        return Err(error);
                    }
                };
                let section_preview = make_preview(&section_json);
                emit_stage(
                    &app,
                    &lecture_id,
                    &sub_stage,
                    "complete",
                    Some(section_preview),
                    None,
                    1,
                );
                section_notes.push(section_json);
            }

            let merged = merge_notes_sections(&section_notes)?;
            section_notes.clear();
            Ok(merged)
        } else {
            let notes_prompt = prompt_templates::structured_notes_prompt(&context_text, &level);
            run_json_stage(
                &client,
                &app,
                &model,
                &notes_prompt,
                &lecture_id,
                stage,
                Some(prompt_templates::notes_response_schema()),
                validate_notes_json,
            )
            .await
        }
    }
    .await;

    let notes_json = match notes_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 2);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_notes(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
            Some(json)
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 2);
            None
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3 — Quiz
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "quiz";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 2);
    mark_stage_starting(&db, &lecture_id, stage);

    let quiz_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }

        if should_process_by_section {
            let mut section_quizzes = Vec::new();
            let total = long_sections.len();
            for (index, section) in long_sections.iter().enumerate() {
                let sub_stage = format!("quiz_section_{}", index + 1);
                emit_stage(&app, &lecture_id, &sub_stage, "starting", None, None, 2);
                let section_context = format!(
                    "LECTURE SUMMARY:\n{summary_text}\n\nSECTION {}/{}:\n{}",
                    index + 1,
                    total,
                    section
                );
                let section_prompt = prompt_templates::quiz_prompt(&section_context, &level);
                let section_json = match run_json_stage(
                    &client,
                    &app,
                    &model,
                    &section_prompt,
                    &lecture_id,
                    &sub_stage,
                    Some(prompt_templates::quiz_response_schema()),
                    validate_quiz_json,
                )
                .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        emit_stage(
                            &app,
                            &lecture_id,
                            &sub_stage,
                            "error",
                            None,
                            Some(error.clone()),
                            2,
                        );
                        return Err(error);
                    }
                };
                let section_preview = make_preview(&section_json);
                emit_stage(
                    &app,
                    &lecture_id,
                    &sub_stage,
                    "complete",
                    Some(section_preview),
                    None,
                    2,
                );
                section_quizzes.push(section_json);
            }

            let merged = merge_quiz_sections(&section_quizzes)?;
            section_quizzes.clear();
            Ok(merged)
        } else {
            let quiz_prompt = prompt_templates::quiz_prompt(&context_text, &level);
            run_json_stage(
                &client,
                &app,
                &model,
                &quiz_prompt,
                &lecture_id,
                stage,
                Some(prompt_templates::quiz_response_schema()),
                validate_quiz_json,
            )
            .await
        }
    }
    .await;

    match quiz_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 3);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_quiz(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 3);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4 — Flashcards
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "flashcards";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 3);
    mark_stage_starting(&db, &lecture_id, stage);

    let flashcards_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }
        if should_process_by_section {
            let mut section_flashcards = Vec::new();
            let total = long_sections.len();
            for (index, section) in long_sections.iter().enumerate() {
                let sub_stage = format!("flashcards_section_{}", index + 1);
                emit_stage(&app, &lecture_id, &sub_stage, "starting", None, None, 3);
                let section_context = format!(
                    "LECTURE SUMMARY:\n{summary_text}\n\nSECTION {}/{}:\n{}",
                    index + 1,
                    total,
                    section
                );
                let section_prompt = prompt_templates::flashcards_prompt(&section_context, &level);
                let section_json = match run_json_stage(
                    &client,
                    &app,
                    &model,
                    &section_prompt,
                    &lecture_id,
                    &sub_stage,
                    Some(prompt_templates::flashcards_response_schema()),
                    validate_flashcards_json,
                )
                .await
                {
                    Ok(value) => value,
                    Err(error) => {
                        emit_stage(
                            &app,
                            &lecture_id,
                            &sub_stage,
                            "error",
                            None,
                            Some(error.clone()),
                            3,
                        );
                        return Err(error);
                    }
                };
                let section_preview = make_preview(&section_json);
                emit_stage(
                    &app,
                    &lecture_id,
                    &sub_stage,
                    "complete",
                    Some(section_preview),
                    None,
                    3,
                );
                section_flashcards.push(section_json);
            }

            let merged = merge_flashcards_sections(&section_flashcards)?;
            section_flashcards.clear();
            Ok(merged)
        } else {
            let flashcards_prompt = prompt_templates::flashcards_prompt(&context_text, &level);
            run_json_stage(
                &client,
                &app,
                &model,
                &flashcards_prompt,
                &lecture_id,
                stage,
                Some(prompt_templates::flashcards_response_schema()),
                validate_flashcards_json,
            )
            .await
        }
    }
    .await;

    match flashcards_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 4);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_flashcards(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 4);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5 — Mind Map
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "mindmap";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 4);
    mark_stage_starting(&db, &lecture_id, stage);

    let mindmap_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }
        let mindmap_source =
            build_mindmap_source(&summary_text, notes_json.as_deref(), &context_text);
        let mindmap_prompt = prompt_templates::mindmap_prompt(&mindmap_source, &level);
        run_json_stage(
            &client,
            &app,
            &model,
            &mindmap_prompt,
            &lecture_id,
            stage,
            Some(serde_json::Value::String("json".to_string())),
            validate_mindmap_json,
        )
        .await
    }
    .await;

    match mindmap_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 5);
            if let Ok(conn) = db.connect() {
                let _ = queries::upsert_mindmap(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 5);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6 — Research Keywords
    // ─────────────────────────────────────────────────────────────────────────
    let stage = "keywords";
    emit_stage(&app, &lecture_id, stage, "starting", None, None, 5);
    mark_stage_starting(&db, &lecture_id, stage);

    let keywords_input = build_keywords_source(&summary_text, notes_json.as_deref(), &context_text);
    let keywords_result: Result<String, String> = async {
        if options.use_cache {
            if let Some(cached) =
                load_cached_stage_result(&db, &lecture_id, stage, &transcript_hash)
            {
                return Ok(cached);
            }
        }
        let keywords_prompt = prompt_templates::extract_keywords_prompt(&keywords_input);
        run_json_stage(
            &client,
            &app,
            &model,
            &keywords_prompt,
            &lecture_id,
            stage,
            Some(prompt_templates::keywords_response_schema()),
            validate_keywords_json,
        )
        .await
    }
    .await;

    match keywords_result {
        Ok(json) => {
            let preview = make_preview(&json);
            mark_stage_complete(&db, &lecture_id, stage, &preview);
            emit_stage(&app, &lecture_id, stage, "complete", Some(preview), None, 6);
            if let Ok(conn) = db.connect() {
                let _ = queries::update_lecture_keywords(&conn, &lecture_id, &json);
            }
            store_cached_stage_result(&db, &lecture_id, stage, &transcript_hash, &json);
        }
        Err(e) => {
            mark_stage_error(&db, &lecture_id, stage, &e);
            emit_stage(&app, &lecture_id, stage, "error", None, Some(e), 6);
        }
    }

    // ── Finalise lecture status ───────────────────────────────────────────────
    if let Ok(conn) = db.connect() {
        let _ = queries::update_lecture_status(&conn, &lecture_id, "complete");
    }

    if settings.delete_audio_after_processing {
        cleanup_audio_after_processing(&app, &db, &lecture_id);
    }

    // Emit overall completion event
    emit_stage(&app, &lecture_id, "pipeline", "complete", None, None, 6);
}

#[cfg(test)]
mod tests {
    use super::sanitize_summary_text;

    #[test]
    fn sanitize_summary_removes_conversational_wrapper_and_tail() {
        let raw = "Okay, here's a concise summary of the lecture: **Thesis:** Prioritize \
functionality before visual shell.\n\n---\n**Rationale for Language & Tone:** ...\n\
Would you like me to expand on these points?";

        let cleaned = sanitize_summary_text(raw);
        let cleaned_lower = cleaned.to_ascii_lowercase();

        assert!(cleaned.starts_with("**Thesis:**"));
        assert!(!cleaned_lower.contains("rationale for language"));
        assert!(!cleaned_lower.contains("would you like"));
    }

    #[test]
    fn sanitize_summary_keeps_regular_summary_content() {
        let raw = "## Summary\n\n- Main point one\n- Main point two";
        assert_eq!(sanitize_summary_text(raw), raw);
    }

    #[test]
    fn sanitize_summary_removes_plain_summary_preface_line() {
        let raw = "Here’s a concise summary of the lecture:\n\nGit is a database that \
utilizes commits as fundamental units of history.";

        let cleaned = sanitize_summary_text(raw);

        assert_eq!(
            cleaned,
            "Git is a database that utilizes commits as fundamental units of history."
        );
    }
}
