import { create } from "zustand";
import type { Settings, OllamaStatus } from "../lib/types";
import { checkOllamaStatus as apiCheckOllama, getSettings as apiGetSettings, saveSettings as apiSaveSettings } from "../lib/tauriApi";

interface SettingsState {
  settings: Settings | null;
  ollamaStatus: OllamaStatus | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  loadSettings: () => Promise<void>;
  saveSettings: (settings: Settings) => Promise<boolean>;
  checkOllama: (ollamaUrl: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  ollamaStatus: null,
  isLoading: false,
  isSaving: false,
  error: null,

  loadSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      const settings = await apiGetSettings();
      set({ settings, isLoading: false });
      await get().checkOllama(settings.ollama_url);
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  saveSettings: async (settings: Settings) => {
    set({ isSaving: true, error: null });
    try {
      await apiSaveSettings(settings);
      set({ settings, isSaving: false });
      return true;
    } catch (e) {
      set({ error: String(e), isSaving: false });
      return false;
    }
  },

  checkOllama: async (ollamaUrl: string) => {
    try {
      const status = await apiCheckOllama(ollamaUrl);
      set({ ollamaStatus: status });
    } catch (e) {
      set({
        ollamaStatus: {
          connected: false,
          models: [],
          error: String(e),
        },
      });
    }
  },
}));
