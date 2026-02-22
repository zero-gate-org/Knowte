import { create } from "zustand";
import type { LlmStreamEvent, PipelineStage, PipelineStageEvent, PipelineStageStatus } from "../lib/types";

// ─── Stage configuration (single source of truth) ────────────────────────────

export const PIPELINE_STAGE_DEFS: { name: string; label: string }[] = [
  { name: "summary", label: "Summarization" },
  { name: "notes", label: "Structured Notes" },
  { name: "quiz", label: "Quiz Questions" },
  { name: "flashcards", label: "Flashcards" },
  { name: "mindmap", label: "Mind Map" },
  { name: "keywords", label: "Research Keywords" },
];

export const TOTAL_PIPELINE_STAGES = PIPELINE_STAGE_DEFS.length;

// ─── Per-lecture state shape ───────────────────────────────────────────────────

export interface SectionProgress {
  total: number;
  completed: number[];
  running: number | null;
}

export interface LecturePipelineState {
  stages: PipelineStage[];
  stagesComplete: number;
  streamingTokens: Record<string, string>;
  sectionProgress: Record<string, SectionProgress>;
  isDone: boolean;
  pipelineWarning: string | null;
}

// ─── Store interface ───────────────────────────────────────────────────────────

interface PipelineStore {
  /** Pipeline state keyed by lectureId */
  lectureStates: Record<string, LecturePipelineState>;

  /** Reset / initialise state for a lectureId (call before kicking off a new pipeline) */
  initLecture: (lectureId: string) => void;

  /** Ingests a `pipeline-stage` Tauri event. Safe to call from any context. */
  handleStageEvent: (payload: PipelineStageEvent) => void;

  /** Ingests a `llm-stream` Tauri event. Safe to call from any context. */
  handleStreamEvent: (payload: LlmStreamEvent) => void;

  /** Programmatically set a single stage status (retry / skip helpers). */
  updateStageStatus: (
    lectureId: string,
    stageName: string,
    status: PipelineStageStatus,
    preview?: string,
    error?: string,
  ) => void;

  /** Ensure stagesComplete is at least `minimum` for the given lecture. */
  bumpStagesComplete: (lectureId: string, minimum: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDefaultState(): LecturePipelineState {
  return {
    stages: PIPELINE_STAGE_DEFS.map((s) => ({ ...s, status: "pending" as const })),
    stagesComplete: 0,
    streamingTokens: {},
    sectionProgress: {},
    isDone: false,
    pipelineWarning: null,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePipelineStore = create<PipelineStore>((set) => ({
  lectureStates: {},

  // ── initLecture ────────────────────────────────────────────────────────────
  initLecture: (lectureId) =>
    set((state) => ({
      lectureStates: {
        ...state.lectureStates,
        [lectureId]: makeDefaultState(),
      },
    })),

  // ── handleStageEvent ───────────────────────────────────────────────────────
  handleStageEvent: (payload) =>
    set((state) => {
      const { lecture_id: lectureId } = payload;
      let current: LecturePipelineState = state.lectureStates[lectureId] ?? makeDefaultState();

      // ── Pipeline-level meta events ─────────────────────────────────────────
      if (payload.stage === "pipeline") {
        if (payload.status === "warning") {
          current = {
            ...current,
            pipelineWarning:
              payload.error ?? "Results may be limited due to a very short transcript.",
          };
        } else if (payload.status === "complete") {
          current = { ...current, isDone: true };
        }
        return { lectureStates: { ...state.lectureStates, [lectureId]: current } };
      }

      // ── Fresh run detection ────────────────────────────────────────────────
      // If the first stage fires "starting" and the lecture was previously finished,
      // this is a brand-new pipeline run — reset everything.
      if (payload.stage === "summary" && payload.status === "starting" && current.isDone) {
        current = makeDefaultState();
      }

      // ── Section-level progress (e.g. summary_chunk_2) ─────────────────────
      const sectionMatch = payload.stage.match(/^(summary|notes|quiz)_(?:chunk|section)_(\d+)$/);
      if (sectionMatch) {
        const parentStage = sectionMatch[1];
        const index = Number(sectionMatch[2]);
        if (Number.isFinite(index) && index > 0) {
          const section: SectionProgress = current.sectionProgress[parentStage] ?? {
            total: 0,
            completed: [],
            running: null,
          };
          const nextCompleted = [...section.completed];
          if (payload.status === "complete" && !nextCompleted.includes(index)) {
            nextCompleted.push(index);
          }
          current = {
            ...current,
            sectionProgress: {
              ...current.sectionProgress,
              [parentStage]: {
                total: Math.max(section.total, index),
                completed: nextCompleted,
                running:
                  payload.status === "starting"
                    ? index
                    : section.running === index
                      ? null
                      : section.running,
              },
            },
          };
        }
        return { lectureStates: { ...state.lectureStates, [lectureId]: current } };
      }

      // ── Regular stage event ────────────────────────────────────────────────
      const updatedStages = current.stages.map((s) => {
        if (s.name !== payload.stage) return s;
        return {
          ...s,
          status:
            payload.status === "starting"
              ? ("running" as const)
              : (payload.status as PipelineStage["status"]),
          preview: payload.preview,
          error: payload.error,
        };
      });

      // Clear the streaming buffer once a stage finishes (success or error).
      let nextStreamingTokens = current.streamingTokens;
      if (payload.status === "complete" || payload.status === "error") {
        const { [payload.stage]: _removed, ...rest } = nextStreamingTokens;
        nextStreamingTokens = rest;
      }

      current = {
        ...current,
        stages: updatedStages,
        streamingTokens: nextStreamingTokens,
        stagesComplete:
          payload.stages_complete !== undefined
            ? Math.max(current.stagesComplete, payload.stages_complete)
            : current.stagesComplete,
      };

      return { lectureStates: { ...state.lectureStates, [lectureId]: current } };
    }),

  // ── handleStreamEvent ──────────────────────────────────────────────────────
  handleStreamEvent: (payload) =>
    set((state) => {
      const { lecture_id: lectureId, stage, token } = payload;
      const current = state.lectureStates[lectureId];
      if (!current) return state;
      return {
        lectureStates: {
          ...state.lectureStates,
          [lectureId]: {
            ...current,
            streamingTokens: {
              ...current.streamingTokens,
              [stage]: (current.streamingTokens[stage] ?? "") + token,
            },
          },
        },
      };
    }),

  // ── updateStageStatus ──────────────────────────────────────────────────────
  updateStageStatus: (lectureId, stageName, status, preview, error) =>
    set((state) => {
      const current = state.lectureStates[lectureId];
      if (!current) return state;
      return {
        lectureStates: {
          ...state.lectureStates,
          [lectureId]: {
            ...current,
            stages: current.stages.map((s) =>
              s.name === stageName ? { ...s, status, preview, error } : s,
            ),
          },
        },
      };
    }),

  // ── bumpStagesComplete ─────────────────────────────────────────────────────
  bumpStagesComplete: (lectureId, minimum) =>
    set((state) => {
      const current = state.lectureStates[lectureId];
      if (!current) return state;
      return {
        lectureStates: {
          ...state.lectureStates,
          [lectureId]: {
            ...current,
            stagesComplete: Math.max(current.stagesComplete, minimum),
          },
        },
      };
    }),
}));
