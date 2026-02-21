#![allow(dead_code)]

use serde::{Deserialize, Serialize};

// ─── Structured Notes ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotesTopic {
    pub heading: String,
    pub key_points: Vec<String>,
    pub details: String,
    pub examples: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotesTerm {
    pub term: String,
    pub definition: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredNotes {
    pub title: String,
    pub topics: Vec<NotesTopic>,
    pub key_terms: Vec<NotesTerm>,
    pub takeaways: Vec<String>,
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Question {
    pub id: i64,
    #[serde(rename = "type")]
    pub question_type: String,
    pub question: String,
    pub options: Option<Vec<String>>,
    pub correct_answer: String,
    pub explanation: String,
    pub difficulty: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quiz {
    pub questions: Vec<Question>,
}

// ─── Flashcards ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flashcard {
    pub front: String,
    pub back: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlashcardsOutput {
    pub cards: Vec<Flashcard>,
}

// ─── Mind Map ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindMapNode {
    pub label: String,
    pub children: Vec<MindMapNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MindMapData {
    pub root: MindMapNode,
}

// ─── Research Keywords ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeywordsOutput {
    pub keywords: Vec<String>,
}
