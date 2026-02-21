import { create } from "zustand";

const SIDEBAR_COLLAPSE_STORAGE_KEY = "knowte.sidebar.collapsed";

interface UiState {
  isSidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

function readInitialSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  isSidebarCollapsed: readInitialSidebarCollapsed(),

  setSidebarCollapsed: (collapsed) => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore storage errors in restricted environments.
    }
    set({ isSidebarCollapsed: collapsed });
  },

  toggleSidebarCollapsed: () => {
    const next = !get().isSidebarCollapsed;
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage errors in restricted environments.
    }
    set({ isSidebarCollapsed: next });
  },
}));
