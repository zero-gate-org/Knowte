/// Maps a personalization level key to a human-readable description
#[allow(dead_code)]
pub fn get_level_description(level: &str) -> &'static str {
    match level {
        "high_school" => "high school student (ages 15-18)",
        "undergraduate_1st_year" => "first-year university student",
        "undergraduate_2nd_year" => "second-year university student",
        "undergraduate_3rd_year" => "third-year university student",
        "graduate" => "graduate/masters student",
        "phd_researcher" => "PhD researcher",
        _ => "university student",
    }
}

#[allow(dead_code)]
fn personalization_preamble(level: &str) -> String {
    format!(
        "You are an expert educational assistant. Adapt your language and explanations for a student at the {} level. Be precise, clear, and pedagogically sound.\n\n",
        get_level_description(level)
    )
}

/// Prompt 1 — Summarize the lecture in 3-5 paragraphs (plain text output)
#[allow(dead_code)]
pub fn summarize_prompt(transcript: &str, level: &str) -> String {
    format!(
        "{}Create a concise summary of this lecture in 3-5 paragraphs. \
Highlight the main thesis, key arguments, and conclusions.\n\
Lecture transcript: {}",
        personalization_preamble(level),
        transcript
    )
}

/// Prompt 2 — Generate structured notes (JSON output)
#[allow(dead_code)]
pub fn structured_notes_prompt(transcript: &str, level: &str) -> String {
    format!(
        r#"{}Generate structured lecture notes from this transcript.
Output as JSON with this exact schema:
{{
  "title": "string",
  "topics": [
    {{
      "heading": "string",
      "key_points": ["string"],
      "details": "string",
      "examples": ["string"]
    }}
  ],
  "key_terms": [
    {{ "term": "string", "definition": "string" }}
  ],
  "takeaways": ["string"]
}}
Only output valid JSON, nothing else.
Transcript: {}"#,
        personalization_preamble(level),
        transcript
    )
}

/// Prompt 3 — Generate 10 quiz questions in mixed formats (JSON output)
#[allow(dead_code)]
pub fn quiz_prompt(transcript: &str, level: &str) -> String {
    format!(
        r#"{}Generate exactly 10 quiz questions from this lecture transcript.
Mix of types: 5 multiple choice, 3 short answer, 2 true/false.
Output as JSON:
{{
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "question": "string",
      "options": ["string"],
      "correct_answer": "string",
      "explanation": "string",
      "difficulty": "easy"
    }}
  ]
}}
For "short_answer" and "true_false" types, set "options" to null.
For "true_false", "options" should be ["True", "False"].
Difficulty must be one of: "easy", "medium", "hard".
Type must be one of: "multiple_choice", "short_answer", "true_false".
Only output valid JSON.
Transcript: {}"#,
        personalization_preamble(level),
        transcript
    )
}

/// Prompt 4 — Generate 15-20 Anki-style flashcards (JSON output)
#[allow(dead_code)]
pub fn flashcards_prompt(transcript: &str, level: &str) -> String {
    format!(
        r#"{}Generate 15-20 Anki-style flashcards from this lecture.
Output as JSON:
{{
  "cards": [
    {{
      "front": "string (question or concept)",
      "back": "string (answer or explanation)",
      "tags": ["string"]
    }}
  ]
}}
Only output valid JSON.
Transcript: {}"#,
        personalization_preamble(level),
        transcript
    )
}

/// Prompt 5 — Create a hierarchical mind map structure (JSON output)
#[allow(dead_code)]
pub fn mindmap_prompt(transcript: &str, level: &str) -> String {
    format!(
        r#"{}Create a hierarchical mind map structure from this lecture.
Output as JSON:
{{
  "root": {{
    "label": "string (main topic)",
    "children": [
      {{
        "label": "string",
        "children": [
          {{ "label": "string", "children": [] }}
        ]
      }}
    ]
  }}
}}
Only output valid JSON.
Transcript: {}"#,
        personalization_preamble(level),
        transcript
    )
}

/// Prompt 6 — Extract 5-10 academic keywords for paper search (JSON output)
#[allow(dead_code)]
pub fn extract_keywords_prompt(transcript: &str) -> String {
    format!(
        r#"Extract 5-10 academic keywords/key phrases from this lecture that would be good search terms for finding related research papers.
Return as JSON: {{ "keywords": ["string"] }}
Only output valid JSON.
Transcript: {}"#,
        transcript
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_description_known() {
        assert_eq!(
            get_level_description("high_school"),
            "high school student (ages 15-18)"
        );
        assert_eq!(get_level_description("phd_researcher"), "PhD researcher");
    }

    #[test]
    fn test_level_description_unknown_fallback() {
        assert_eq!(get_level_description("unknown_level"), "university student");
    }

    #[test]
    fn test_summarize_prompt_contains_transcript() {
        let prompt = summarize_prompt("This is the transcript.", "graduate");
        assert!(prompt.contains("This is the transcript."));
        assert!(prompt.contains("graduate/masters student"));
        assert!(prompt.contains("3-5 paragraphs"));
    }

    #[test]
    fn test_structured_notes_prompt_contains_json_schema() {
        let prompt = structured_notes_prompt("transcript text", "undergraduate_2nd_year");
        assert!(prompt.contains("key_terms"));
        assert!(prompt.contains("takeaways"));
        assert!(prompt.contains("Only output valid JSON"));
    }

    #[test]
    fn test_quiz_prompt_contains_question_types() {
        let prompt = quiz_prompt("transcript text", "undergraduate_1st_year");
        assert!(prompt.contains("multiple_choice"));
        assert!(prompt.contains("short_answer"));
        assert!(prompt.contains("true_false"));
    }

    #[test]
    fn test_flashcards_prompt_contains_cards_schema() {
        let prompt = flashcards_prompt("transcript text", "high_school");
        assert!(prompt.contains("\"cards\""));
        assert!(prompt.contains("\"front\""));
        assert!(prompt.contains("\"back\""));
    }

    #[test]
    fn test_mindmap_prompt_contains_root_schema() {
        let prompt = mindmap_prompt("transcript text", "graduate");
        assert!(prompt.contains("\"root\""));
        assert!(prompt.contains("\"children\""));
    }

    #[test]
    fn test_extract_keywords_prompt_no_level() {
        let prompt = extract_keywords_prompt("machine learning and neural networks");
        assert!(prompt.contains("keywords"));
        assert!(prompt.contains("machine learning and neural networks"));
    }
}
