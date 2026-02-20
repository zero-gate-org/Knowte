import { create } from "zustand";
import type { Lecture } from "../lib/types";

interface LectureState {
  lectures: Lecture[];
  currentLectureId: string | null;
  isUploading: boolean;
  isRecording: boolean;
  error: string | null;

  addLecture: (lecture: Lecture) => void;
  setCurrentLecture: (lectureId: string | null) => void;
  updateLecture: (lectureId: string, updates: Partial<Lecture>) => void;
  setUploading: (isUploading: boolean) => void;
  setRecording: (isRecording: boolean) => void;
  setError: (error: string | null) => void;
}

export const useLectureStore = create<LectureState>((set) => ({
  lectures: [],
  currentLectureId: null,
  isUploading: false,
  isRecording: false,
  error: null,

  addLecture: (lecture) =>
    set((state) => ({
      lectures: [lecture, ...state.lectures.filter((item) => item.id !== lecture.id)],
      currentLectureId: lecture.id,
      error: null,
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

  setError: (error) =>
    set({
      error,
    }),
}));
