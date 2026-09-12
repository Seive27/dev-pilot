import { create } from "zustand";
import type { Page } from "../types";

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  variant: "info" | "success" | "error";
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface UiState {
  page: Page;
  selectedProjectId: string | null;
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  gitWorkflowOpen: boolean;
  gitWorkflowProjectId: string | null;
  navigate: (page: Page) => void;
  openProject: (id: string) => void;
  openGitWorkflow: (projectId?: string | null) => void;
  closeGitWorkflow: () => void;
  toast: (title: string, opts?: { detail?: string; variant?: Toast["variant"] }) => void;
  dismissToast: (id: number) => void;
  requestConfirm: (req: ConfirmRequest) => void;
  resolveConfirm: (ok: boolean) => void;
}

let toastId = 0;

export const useUiStore = create<UiState>((set, get) => ({
  page: "overview",
  selectedProjectId: null,
  toasts: [],
  confirm: null,
  gitWorkflowOpen: false,
  gitWorkflowProjectId: null,

  navigate: (page) => set({ page, selectedProjectId: null }),

  openProject: (id) => {
    set({ page: "projects", selectedProjectId: id });
    import("./projectsStore").then(({ useProjectsStore }) => {
      useProjectsStore.getState().setActiveProject(id);
    });
  },

  openGitWorkflow: (projectId) => {
    set((s) => ({
      gitWorkflowOpen: true,
      gitWorkflowProjectId: projectId ?? s.selectedProjectId,
    }));
  },

  closeGitWorkflow: () => {
    set({ gitWorkflowOpen: false });
  },

  toast: (title, opts) => {
    const id = ++toastId;
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id, title, detail: opts?.detail, variant: opts?.variant ?? "info" },
      ],
    }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  requestConfirm: (req) => set({ confirm: req }),

  resolveConfirm: (ok) => {
    const req = get().confirm;
    set({ confirm: null });
    if (ok && req) {
      req.onConfirm();
    }
  },
}));