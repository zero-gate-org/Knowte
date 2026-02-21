import { create } from "zustand";
import type { Lecture } from "../lib/types";

interface LectureState {
  lectures: Lecture[];
  currentLectureId: string | null;
  isUploading: boolean;
  isRecording: boolean;
  isProcessingLecture: boolean;
  error: string | null;

  setLectures: (lectures: Lecture[]) => void;
  addLecture: (lecture: Lecture) => void;
  removeLecture: (lectureId: string) => void;
  setCurrentLecture: (lectureId: string | null) => void;
  updateLecture: (lectureId: string, updates: Partial<Lecture>) => void;
  setUploading: (isUploading: boolean) => void;
  setRecording: (isRecording: boolean) => void;
  setProcessingLecture: (isProcessingLecture: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLectureStore = create<LectureState>((set) => ({
  lectures: [],
  currentLectureId: null,
  isUploading: false,
  isRecording: false,
  isProcessingLecture: false,
  error: null,

  setLectures: (lectures) =>
    set((state) => ({
      lectures: lectures.map((lecture) => {
        const existing = state.lectures.find((item) => item.id === lecture.id);
        return existing ? { ...existing, ...lecture } : lecture;
      }),
      currentLectureId:
        state.currentLectureId && lectures.some((lecture) => lecture.id === state.currentLectureId)
          ? state.currentLectureId
          : null,
    })),

  addLecture: (lecture) =>
    set((state) => ({
      lectures: [lecture, ...state.lectures.filter((item) => item.id !== lecture.id)],
      currentLectureId: lecture.id,
      error: null,
    })),

  removeLecture: (lectureId) =>
    set((state) => ({
      lectures: state.lectures.filter((lecture) => lecture.id !== lectureId),
      currentLectureId: state.currentLectureId === lectureId ? null : state.currentLectureId,
    })),

  setCurrentLecture: (lectureId) =>
    set({
      currentLectureId: lectureId,
    }),

  updateLecture: (lectureId, updates) =>
    set((state) => ({
      lectures: state.lectures.map((lecture) =>
        lecture.id === lectureId ? { ...lecture, ...updates } : lecture,
      ),
    })),

  setUploading: (isUploading) =>
    set({
      isUploading,
    }),

  setRecording: (isRecording) =>
    set({
      isRecording,
    }),

  setProcessingLecture: (isProcessingLecture) =>
    set({
      isProcessingLecture,
    }),

  setError: (error) =>
    set({
      error,
    }),
}));
