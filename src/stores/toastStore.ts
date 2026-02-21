import { create } from "zustand";

export type ToastKind = "success" | "warning" | "error" | "info";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  title?: string;
  createdAt: number;
}

interface ToastState {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id" | "createdAt">) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const MAX_TOASTS = 3;

function generateToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (toast) => {
    const id = generateToastId();
    const nextToast: ToastItem = {
      id,
      kind: toast.kind,
      message: toast.message,
      title: toast.title,
      createdAt: Date.now(),
    };

    set((state) => {
      const trimmed = state.toasts.slice(-(MAX_TOASTS - 1));
      return { toasts: [...trimmed, nextToast] };
    });

    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
  clearToasts: () => set({ toasts: [] }),
}));
