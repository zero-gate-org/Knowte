import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  checkOllamaStatus as apiCheckOllama,
  checkWhisperModels as apiCheckWhisperModels,
  downloadWhisperModel as apiDownloadWhisperModel,
  getSettings as apiGetSettings,
  saveSettings as apiSaveSettings,
} from "../lib/tauriApi";
import type { OllamaStatus, Settings, WhisperDownloadProgress } from "../lib/types";

interface SettingsState {
  settings: Settings | null;
  ollamaStatus: OllamaStatus | null;
  whisperModelsOnDisk: string[];
  whisperDownloadProgress: number;
  whisperDownloadingModel: string | null;
  whisperError: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<boolean>;
  checkOllama: (ollamaUrl: string) => Promise<void>;
  loadWhisperModels: () => Promise<void>;
  downloadWhisperModel: (modelSize: string) => Promise<boolean>;
}

const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  ollamaStatus: null,
  whisperModelsOnDisk: [],
  whisperDownloadProgress: 0,
  whisperDownloadingModel: null,
  whisperError: null,
  isLoading: false,
  isSaving: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await apiGetSettings();
      set({ settings, isLoading: false });
      await Promise.all([
        get().checkOllama(settings.ollama_url),
        get().loadWhisperModels(),
      ]);
    } catch (error) {
      set({ error: formatError(error), isLoading: false });
    }
  },

  saveSettings: async (settings) => {
    set({ isSaving: true, error: null });
    try {
      await apiSaveSettings(settings);
      set({ settings, isSaving: false });
      return true;
    } catch (error) {
      set({ error: formatError(error), isSaving: false });
      return false;
    }
  },

  checkOllama: async (ollamaUrl) => {
    try {
      const status = await apiCheckOllama(ollamaUrl);
      set({ ollamaStatus: status });
    } catch (error) {
      set({
        ollamaStatus: {
          connected: false,
          models: [],
          error: formatError(error),
        },
      });
    }
  },

  loadWhisperModels: async () => {
    try {
      const whisperModelsOnDisk = await apiCheckWhisperModels();
      set({ whisperModelsOnDisk, whisperError: null });
    } catch (error) {
      set({ whisperError: formatError(error) });
    }
  },

  downloadWhisperModel: async (modelSize) => {
    set({
      whisperDownloadingModel: modelSize,
      whisperDownloadProgress: 0,
      whisperError: null,
    });

    let unlisten:
      | (() => void)
      | undefined;
    try {
      unlisten = await listen<WhisperDownloadProgress>(
        "whisper-download-progress",
        (event) => {
          if (event.payload.model_size !== modelSize) {
            return;
          }

          set({
            whisperDownloadProgress: Math.max(
              0,
              Math.min(100, event.payload.percent),
            ),
          });
        },
      );

      await apiDownloadWhisperModel(modelSize);
      await get().loadWhisperModels();
      set({
        whisperDownloadingModel: null,
        whisperDownloadProgress: 100,
      });
      return true;
    } catch (error) {
      set({
        whisperDownloadingModel: null,
        whisperDownloadProgress: 0,
        whisperError: formatError(error),
      });
      return false;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  },
}));
