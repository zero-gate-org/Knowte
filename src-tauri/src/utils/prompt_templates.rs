use serde_json::{json, Value};

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
pub fn summary_system_prompt() -> String {
    "Follow the user's prompt exactly and return only the requested content.".to_string()
}

#[allow(dead_code)]
pub fn structured_output_system_prompt() -> String {
    "Return only valid JSON that matches the requested output shape.".to_string()
}

#[allow(dead_code)]
fn learner_context(level: &str) -> String {
    format!(
        "Target learner: {}. Match depth and wording to this learner without becoming vague.",
        get_level_description(level)
    )
}

fn render_rules(rules: &[&str]) -> String {
    rules
        .iter()
        .map(|rule| format!("- {rule}"))
        .collect::<Vec<_>>()
        .join("\n")
}

fn tagged_prompt(
    level: &str,
    task: &str,
    rules: &[&str],
    output_contract: &str,
    example: &str,
    source: &str,
) -> String {
    format!(
        r#"<role>
You are an expert educational content generator for local/offline study tools.
{learner_context}
</role>

<task>
{task}
</task>

<rules>
{rules}
</rules>

<output_contract>
{output_contract}
</output_contract>

<good_example>
{example}
</good_example>

<source>
{source}
</source>"#,
        learner_context = learner_context(level),
        rules = render_rules(rules),
    )
}

/// Prompt 1 — Summarize the lecture in 3-5 paragraphs (plain text output)
#[allow(dead_code)]
pub fn summarize_prompt(transcript: &str, level: &str) -> String {
    tagged_prompt(
        level,
        "Write a concise lecture summary in 3-5 short paragraphs. Cover the main topic, the core argument or explanation, the most important supporting ideas, and the conclusion or takeaway.",
        &[
            "Use only information grounded in the source.",
            "Do not include greetings, disclaimers, or phrases like 'Here is the summary'.",
            "Do not mention the transcript itself.",
            "Prefer concrete concepts and technical terms over generic filler.",
            "If the lecture is fragmented, summarize only the parts that are clearly supported.",
            "Output plain text only.",
        ],
        "A compact summary with no headings, no bullet list, and no conversational follow-up.",
        "The lecture explains gradient descent, why learning rate matters, and how overshooting affects convergence.",
        transcript,
    )
}

/// Prompt 2 — Generate structured notes (JSON output)
#[allow(dead_code)]
pub fn structured_notes_prompt(transcript: &str, level: &str) -> String {
    tagged_prompt(
        level,
        "Create comprehensive structured lecture notes as JSON. Think like a strong human note-taker preparing a detailed study guide from this lecture.",
        &[
            "Be comprehensive, not brief. Cover all important concepts, methods, arguments, definitions, mechanisms, steps, and conclusions that appear in the source.",
            "Prefer 5-8 major topics when the lecture has enough substance.",
            "Each topic must represent a distinct concept, method, process, argument, or section of the lecture.",
            "Do not create duplicate topics with slightly different wording.",
            "For each topic, write 3-6 key points when the source supports it.",
            "The details field should be substantive study notes, usually 2-4 full sentences, not a one-line summary.",
            "Include formulas, steps, cause-effect relationships, comparisons, assumptions, and implications when they are present in the lecture.",
            "Include examples only when the lecture provides them or strongly implies them from the explanation.",
            "Use support_materials when the topic benefits from a concrete artifact such as code, pseudocode, formulas, worked examples, timelines, tables, reference snippets, or diagram notes.",
            "For coding lectures, include compact runnable or near-runnable code snippets when the lecture provides enough context.",
            "For mathematics or quantitative lectures, include formulas or worked examples when they help understanding.",
            "For other subjects, include the equivalent study aid when useful, such as timelines, case summaries, structured comparisons, or reference blocks.",
            "Build a useful key_terms section with the important technical vocabulary from the lecture.",
            "Write takeaways as concrete exam-relevant or study-relevant conclusions.",
            "If evidence for a field is weak, use an empty array instead of guessing.",
        ],
        r#"Return JSON with this exact shape:
{
  "title": "string",
  "topics": [
    {
      "heading": "string",
      "key_points": ["string"],
      "details": "string",
      "examples": ["string"],
      "support_materials": [
        {
          "kind": "code | formula | worked_example | timeline | table | reference | diagram_notes | case_study",
          "title": "string",
          "content": "string",
          "language": "string or null"
        }
      ]
    }
  ],
  "key_terms": [
    { "term": "string", "definition": "string" }
  ],
  "takeaways": ["string"]
}"#,
        r#"{
  "title": "Backpropagation Basics",
  "topics": [
    {
      "heading": "Gradient Flow",
      "key_points": [
        "Errors are propagated backward through the network",
        "Each layer receives a gradient derived from the layer after it",
        "The chain rule connects local derivatives across the network"
      ],
      "details": "The lecture explains that backpropagation computes gradients for each layer by moving from the output layer toward the input layer. Instead of differentiating the whole network from scratch for every parameter, it reuses intermediate derivatives efficiently. This makes training deep networks computationally feasible.",
      "examples": [
        "A deep network updates each layer based on downstream error signals",
        "Earlier layers are influenced indirectly through the gradients passed back from later layers"
      ],
      "support_materials": [
        {
          "kind": "formula",
          "title": "Backpropagation update rule",
          "content": "w := w - eta * dL/dw",
          "language": null
        }
      ]
    }
  ],
  "key_terms": [
    { "term": "chain rule", "definition": "A calculus rule used to compute gradients through composed functions" },
    { "term": "gradient", "definition": "A derivative-based signal that indicates how a parameter should change to reduce loss" }
  ],
  "takeaways": [
    "Backpropagation makes multilayer training feasible by computing gradients efficiently",
    "The chain rule is the mathematical basis for passing learning signals through many layers"
  ]
}"#,
        transcript,
    )
}

/// Prompt 3 — Generate 10 quiz questions in mixed formats (JSON output)
#[allow(dead_code)]
pub fn quiz_prompt(transcript: &str, level: &str) -> String {
    tagged_prompt(
        level,
        "Generate exactly 10 evidence-backed quiz questions from this lecture transcript. Cover multiple important topics, not just one repeated idea.",
        &[
            "Use this target mix when possible: 5 multiple_choice, 3 short_answer, 2 true_false.",
            "Each question should test one idea only.",
            "For multiple choice, provide 4 plausible options and make only one correct.",
            "Do not leak the answer in the wording of the question.",
            "Avoid duplicate questions and trivial paraphrases.",
            "If the lecture is too narrow for the target mix, still return exactly 10 high-quality questions using the allowed types.",
        ],
        r#"Return JSON with this exact shape:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "string",
      "options": ["string"],
      "correct_answer": "string",
      "explanation": "string",
      "difficulty": "easy"
    }
  ]
}
Rules:
- Allowed type values: "multiple_choice", "short_answer", "true_false"
- Allowed difficulty values: "easy", "medium", "hard"
- For short_answer, set options to null
- For true_false, set options to ["True", "False"]"#,
        r#"{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice",
      "question": "Why can a learning rate that is too high be a problem in gradient descent?",
      "options": ["It may overshoot the minimum", "It removes all gradients", "It freezes the model", "It guarantees local minima"],
      "correct_answer": "It may overshoot the minimum",
      "explanation": "The lecture states that large update steps can jump past the region of convergence.",
      "difficulty": "easy"
    }
  ]
}"#,
        transcript,
    )
}

/// Prompt 4 — Generate 15-18 Anki-style flashcards (JSON output)
#[allow(dead_code)]
pub fn flashcards_prompt(transcript: &str, level: &str) -> String {
    tagged_prompt(
        level,
        "Generate high-value study flashcards as JSON. Prefer cards that support recall, comparison, process understanding, and core terminology.",
        &[
            "Target 15-18 cards when enough material exists; return fewer only if the source is genuinely narrow.",
            "Each card must test one idea only.",
            "Fronts should be concise and specific.",
            "Backs should be brief, self-contained, and directly answer the front.",
            "Avoid duplicate cards and shallow restatements of the same concept.",
            "Use tags that reflect the concept area, not generic tags like 'lecture' or 'study'.",
        ],
        r#"Return JSON with this exact shape:
{
  "cards": [
    {
      "front": "string",
      "back": "string",
      "tags": ["string"]
    }
  ]
}"#,
        r#"{
  "cards": [
    {
      "front": "Why is the chain rule essential in backpropagation?",
      "back": "It lets the model compute gradients through composed layers by multiplying local derivatives backward through the network.",
      "tags": ["backpropagation", "gradients"]
    }
  ]
}"#,
        transcript,
    )
}

/// Prompt 5 — Create a hierarchical mind map structure (JSON output)
#[allow(dead_code)]
pub fn mindmap_prompt(transcript: &str, level: &str) -> String {
    tagged_prompt(
        level,
        "Create a clear hierarchical mind map as JSON. The root should be the lecture's main topic. First-level children should be the major concept clusters. Second-level children should be concrete subtopics or sub-concepts.",
        &[
            "Prefer 3-6 first-level branches.",
            "Keep the tree shallow: root -> major topic -> subtopic. Avoid unnecessary deeper nesting.",
            "Use short noun-phrase labels.",
            "Do not use generic labels like 'Introduction' or 'Conclusion' unless they are actual concepts.",
            "Make the hierarchy study-friendly: broad concepts at the top, specific ideas below.",
            "Avoid single-child chains unless the structure is truly necessary.",
            "Omit weakly supported branches instead of inventing them.",
        ],
        r#"Return JSON with this exact shape:
{
  "root": {
    "label": "string",
    "children": [
      {
        "label": "string",
        "children": [
          { "label": "string", "children": [] }
        ]
      }
    ]
  }
}"#,
        r#"{
  "root": {
    "label": "Backpropagation",
    "children": [
      {
        "label": "Gradient Computation",
        "children": [
          { "label": "Chain Rule", "children": [] },
          { "label": "Layer-wise Derivatives", "children": [] }
        ]
      }
    ]
  }
}"#,
        transcript,
    )
}

/// Prompt 6 — Extract 6-10 academic keywords for paper search (JSON output)
#[allow(dead_code)]
pub fn extract_keywords_prompt(context: &str) -> String {
    tagged_prompt(
        "undergraduate_2nd_year",
        "Extract research-search keywords and key phrases that would help retrieve academic papers related to this lecture.",
        &[
            "Prefer domain-specific concepts, methods, algorithms, datasets, and formal terms.",
            "Use multi-word phrases when they are better search queries than single words.",
            "Avoid generic terms like 'lecture', 'research', 'important concept', or 'study'.",
            "Return 6-10 distinct search terms.",
            "If a standard acronym and full term both matter, include the more searchable form.",
        ],
        r#"Return JSON with this exact shape:
{
  "keywords": ["string"]
}"#,
        r#"{
  "keywords": ["gradient descent", "learning rate scheduling", "backpropagation", "vanishing gradients"]
}"#,
        context,
    )
}

/// Prompt 7 — Explain a selected excerpt in context (plain text output)
#[allow(dead_code)]
pub fn explain_text_prompt(selected_text: &str, context: &str, level: &str) -> String {
    let context_block = if context.trim().is_empty() {
        "No additional surrounding context provided.".to_string()
    } else {
        context.to_string()
    };

    tagged_prompt(
        level,
        "Explain the selected excerpt from a lecture in plain text.",
        &[
            "Keep the explanation clear, accurate, and concise.",
            "Clarify jargon and implicit assumptions.",
            "Include one short real-world analogy only if it genuinely helps.",
            "End with one short sentence explaining why the concept matters.",
            "Output plain text only.",
        ],
        "A short explanation paragraph with no markdown or code fences.",
        &format!("Selected excerpt:\n{selected_text}\n\nSurrounding context:\n{context_block}"),
        selected_text,
    )
}

/// Prompt 8 — Generate a concise flashcard back from selected text (plain text)
#[allow(dead_code)]
pub fn custom_flashcard_back_prompt(front: &str, context: &str, level: &str) -> String {
    let context_block = if context.trim().is_empty() {
        "No additional surrounding context provided.".to_string()
    } else {
        context.to_string()
    };

    tagged_prompt(
        level,
        "Write a concise flashcard back for the provided front using the lecture context.",
        &[
            "Use 1-3 sentences maximum.",
            "Directly answer or explain the front text.",
            "Keep the wording precise and study-friendly.",
            "Output plain text only.",
        ],
        "A short direct answer with no markdown and no extra commentary.",
        &format!("Front:\n{front}\n\nContext:\n{context_block}"),
        front,
    )
}

#[allow(dead_code)]
pub fn notes_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["title", "topics", "key_terms", "takeaways"],
        "properties": {
            "title": { "type": "string" },
            "topics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["heading", "key_points", "details", "examples", "support_materials"],
                    "properties": {
                        "heading": { "type": "string" },
                        "key_points": { "type": "array", "items": { "type": "string" } },
                        "details": { "type": "string" },
                        "examples": { "type": "array", "items": { "type": "string" } },
                        "support_materials": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["kind", "title", "content", "language"],
                                "properties": {
                                    "kind": { "type": "string" },
                                    "title": { "type": "string" },
                                    "content": { "type": "string" },
                                    "language": { "type": ["string", "null"] }
                                }
                            }
                        }
                    }
                }
            },
            "key_terms": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["term", "definition"],
                    "properties": {
                        "term": { "type": "string" },
                        "definition": { "type": "string" }
                    }
                }
            },
            "takeaways": { "type": "array", "items": { "type": "string" } }
        }
    })
}

#[allow(dead_code)]
pub fn quiz_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["questions"],
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "type", "question", "options", "correct_answer", "explanation", "difficulty"],
                    "properties": {
                        "id": { "type": "integer" },
                        "type": { "type": "string", "enum": ["multiple_choice", "short_answer", "true_false"] },
                        "question": { "type": "string" },
                        "options": {
                            "type": ["array", "null"],
                            "items": { "type": "string" }
                        },
                        "correct_answer": { "type": "string" },
                        "explanation": { "type": "string" },
                        "difficulty": { "type": "string", "enum": ["easy", "medium", "hard"] }
                    }
                }
            }
        }
    })
}

#[allow(dead_code)]
pub fn flashcards_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["cards"],
        "properties": {
            "cards": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["front", "back", "tags"],
                    "properties": {
                        "front": { "type": "string" },
                        "back": { "type": "string" },
                        "tags": { "type": "array", "items": { "type": "string" } }
                    }
                }
            }
        }
    })
}

#[allow(dead_code)]
pub fn mindmap_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["root"],
        "properties": {
            "root": { "$ref": "#/$defs/node" }
        },
        "$defs": {
            "node": {
                "type": "object",
                "required": ["label", "children"],
                "properties": {
                    "label": { "type": "string" },
                    "children": {
                        "type": "array",
                        "items": { "$ref": "#/$defs/node" }
                    }
                }
            }
        }
    })
}

#[allow(dead_code)]
pub fn keywords_response_schema() -> Value {
    json!({
        "type": "object",
        "required": ["keywords"],
        "properties": {
            "keywords": {
                "type": "array",
                "items": { "type": "string" }
            }
        }
    })
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
    fn test_summarize_prompt_contains_sections() {
        let prompt = summarize_prompt("This is the transcript.", "graduate");
        assert!(prompt.contains("<role>"));
        assert!(prompt.contains("<rules>"));
        assert!(prompt.contains("This is the transcript."));
        assert!(prompt.contains("graduate/masters student"));
    }

    #[test]
    fn test_structured_notes_prompt_contains_json_contract() {
        let prompt = structured_notes_prompt("transcript text", "undergraduate_2nd_year");
        assert!(prompt.contains("\"key_terms\""));
        assert!(prompt.contains("\"takeaways\""));
        assert!(prompt.contains("<output_contract>"));
    }

    #[test]
    fn test_quiz_prompt_contains_type_rules() {
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
    fn test_extract_keywords_prompt_contains_keywords_shape() {
        let prompt = extract_keywords_prompt("machine learning and neural networks");
        assert!(prompt.contains("keywords"));
        assert!(prompt.contains("machine learning and neural networks"));
    }

    #[test]
    fn test_notes_response_schema_is_object() {
        assert_eq!(notes_response_schema()["type"], "object");
        assert!(notes_response_schema()["properties"]["topics"].is_object());
    }

    #[test]
    fn test_mindmap_response_schema_has_recursive_node_definition() {
        assert!(mindmap_response_schema()["$defs"]["node"].is_object());
    }

    #[test]
    fn test_structured_output_system_prompt_mentions_json() {
        assert!(structured_output_system_prompt().contains("JSON"));
    }
}
