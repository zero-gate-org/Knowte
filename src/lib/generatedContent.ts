import type {
  Flashcard,
  FlashcardsOutput,
  NotesSupportMaterial,
  NotesTerm,
  NotesTopic,
  Question,
  QuestionDifficulty,
  QuestionType,
  Quiz,
  StructuredNotes,
} from "./types";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function coerceArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value)) {
    return Object.values(value);
  }

  return [];
}

function coerceStringArray(value: unknown): string[] {
  return coerceArray(value).flatMap((item) => {
    const text = asText(item);
    return text ? [text] : [];
  });
}

function normalizeSupportMaterial(value: unknown): NotesSupportMaterial | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = asText(value.kind ?? value.type ?? value.category) ?? "reference";
  const title = asText(value.title ?? value.label ?? value.name) ?? "";
  const content =
    asText(value.content ?? value.text ?? value.body ?? value.value ?? value.snippet) ?? "";
  const language = asText(value.language ?? value.lang ?? value.syntax);

  if (content.length === 0) {
    return null;
  }

  return {
    kind,
    title: title || "Support Material",
    content,
    language,
  };
}

function normalizeNotesTopic(value: unknown, index: number): NotesTopic | null {
  if (!isRecord(value)) {
    const primitive = asText(value);
    if (!primitive) {
      return null;
    }

    return {
      heading: `Topic ${index + 1}`,
      key_points: [primitive],
      details: "",
      examples: [],
      support_materials: [],
    };
  }

  const heading =
    asText(value.heading ?? value.title ?? value.topic ?? value.name) ?? `Topic ${index + 1}`;
  const keyPoints = coerceStringArray(
    value.key_points ?? value.keyPoints ?? value.points ?? value.bullets,
  );
  const details =
    asText(value.details ?? value.description ?? value.summary ?? value.body) ?? "";
  const examples = coerceStringArray(
    value.examples ?? value.example_list ?? value.example ?? value.samples,
  );
  const supportMaterials = coerceArray(
    value.support_materials ?? value.supportMaterials ?? value.artifacts ?? value.resources,
  ).flatMap((item) => {
    const normalized = normalizeSupportMaterial(item);
    return normalized ? [normalized] : [];
  });

  if (
    keyPoints.length === 0 &&
    details.length === 0 &&
    examples.length === 0 &&
    supportMaterials.length === 0
  ) {
    return null;
  }

  return {
    heading,
    key_points: keyPoints,
    details,
    examples,
    support_materials: supportMaterials,
  };
}

function normalizeNotesTerm(value: unknown): NotesTerm | null {
  if (!isRecord(value)) {
    const primitive = asText(value);
    return primitive ? { term: primitive, definition: "" } : null;
  }

  const term = asText(value.term ?? value.name ?? value.concept);
  const definition =
    asText(value.definition ?? value.meaning ?? value.description ?? value.explanation) ?? "";

  if (!term && definition.length === 0) {
    return null;
  }

  return {
    term: term ?? "Key Term",
    definition,
  };
}

function normalizeFlashcard(value: unknown, index: number): Flashcard | null {
  if (!isRecord(value)) {
    const primitive = asText(value);
    return primitive
      ? {
          front: `Card ${index + 1}`,
          back: primitive,
          tags: [],
        }
      : null;
  }

  const front = asText(value.front ?? value.question ?? value.prompt ?? value.term);
  const back = asText(value.back ?? value.answer ?? value.definition ?? value.explanation);
  const tags = coerceStringArray(
    value.tags ?? value.tag_list ?? value.categories ?? value.keywords,
  );

  if (!front && !back) {
    return null;
  }

  return {
    front: front ?? `Card ${index + 1}`,
    back: back ?? "",
    tags,
  };
}

function asQuestionDifficulty(value: unknown): QuestionDifficulty {
  const normalized = asText(value)?.toLowerCase();
  if (normalized === "easy" || normalized === "medium" || normalized === "hard") {
    return normalized;
  }

  return "medium";
}

function asQuestionId(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeBooleanAnswer(value: unknown): string | null {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }

  const text = asText(value)?.toLowerCase();
  if (text === "true" || text === "t") {
    return "True";
  }
  if (text === "false" || text === "f") {
    return "False";
  }

  return null;
}

function asQuestionType(value: unknown, options: string[], correctAnswer: string): QuestionType {
  const normalized = asText(value)
    ?.toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "multiple_choice" || normalized === "mcq") {
    return "multiple_choice";
  }
  if (normalized === "short_answer" || normalized === "short") {
    return "short_answer";
  }
  if (normalized === "true_false" || normalized === "boolean") {
    return "true_false";
  }

  if (normalizeBooleanAnswer(correctAnswer)) {
    return "true_false";
  }

  return options.length >= 2 ? "multiple_choice" : "short_answer";
}

function normalizeQuestion(value: unknown, index: number): Question | null {
  if (!isRecord(value)) {
    const prompt = asText(value);
    if (!prompt) {
      return null;
    }

    return {
      id: index + 1,
      type: "short_answer",
      question: prompt,
      options: null,
      correct_answer: "",
      explanation: "",
      difficulty: "medium",
    };
  }

  const prompt = asText(value.question ?? value.prompt ?? value.text ?? value.title);
  if (!prompt) {
    return null;
  }

  const rawOptions = coerceStringArray(
    value.options ?? value.choices ?? value.answers ?? value.selections,
  );
  const rawCorrectAnswer =
    normalizeBooleanAnswer(value.correct_answer ?? value.correctAnswer ?? value.answer) ??
    asText(value.correct_answer ?? value.correctAnswer ?? value.answer) ??
    "";

  let type = asQuestionType(
    value.type ?? value.question_type ?? value.kind,
    rawOptions,
    rawCorrectAnswer,
  );

  let options: string[] | null = null;
  let correctAnswer = rawCorrectAnswer;

  if (type === "multiple_choice") {
    options = rawOptions;
    if (options.length < 2) {
      type = "short_answer";
      options = null;
    }
  } else if (type === "true_false") {
    options = null;
    correctAnswer = normalizeBooleanAnswer(rawCorrectAnswer) ?? "True";
  }

  return {
    id: asQuestionId(value.id ?? value.question_id, index + 1),
    type,
    question: prompt,
    options,
    correct_answer: correctAnswer,
    explanation: asText(value.explanation ?? value.rationale ?? value.details) ?? "",
    difficulty: asQuestionDifficulty(value.difficulty ?? value.level),
  };
}

export function normalizeStructuredNotes(input: unknown): StructuredNotes | null {
  const raw = isRecord(input)
    ? input
    : Array.isArray(input)
      ? { topics: input }
      : null;

  if (!raw) {
    return null;
  }

  const title =
    asText(raw.title ?? raw.heading ?? raw.topic ?? raw.subject) ?? "Lecture Notes";
  const topics = coerceArray(raw.topics ?? raw.sections ?? raw.outline).flatMap((topic, index) => {
    const normalized = normalizeNotesTopic(topic, index);
    return normalized ? [normalized] : [];
  });
  const keyTerms = coerceArray(
    raw.key_terms ?? raw.keyTerms ?? raw.terms ?? raw.glossary,
  ).flatMap((term) => {
    const normalized = normalizeNotesTerm(term);
    return normalized ? [normalized] : [];
  });
  const takeaways = coerceStringArray(
    raw.takeaways ?? raw.key_takeaways ?? raw.conclusions ?? raw.summary_points,
  );

  return {
    title,
    topics,
    key_terms: keyTerms,
    takeaways,
  };
}

export function parseStructuredNotesJson(rawJson: string): StructuredNotes | null {
  return normalizeStructuredNotes(JSON.parse(rawJson) as unknown);
}

export function parseFlashcardsJson(rawJson: string): FlashcardsOutput | null {
  const input = JSON.parse(rawJson) as unknown;
  const raw = isRecord(input) ? input : null;
  const cardsSource = Array.isArray(input) ? input : raw?.cards ?? raw?.flashcards ?? raw?.items;

  if (cardsSource === undefined) {
    return null;
  }

  return {
    cards: coerceArray(cardsSource).flatMap((card, index) => {
      const normalized = normalizeFlashcard(card, index);
      return normalized ? [normalized] : [];
    }),
  };
}

export function parseQuizJson(rawJson: string): Quiz | null {
  const input = JSON.parse(rawJson) as unknown;
  const raw = isRecord(input) ? input : null;
  const questionsSource = Array.isArray(input)
    ? input
    : raw?.questions ?? raw?.quiz ?? raw?.items;

  if (questionsSource === undefined) {
    return null;
  }

  return {
    questions: coerceArray(questionsSource).flatMap((question, index) => {
      const normalized = normalizeQuestion(question, index);
      return normalized ? [normalized] : [];
    }),
  };
}
