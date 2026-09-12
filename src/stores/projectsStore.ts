import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";
import type { Project, RepoSnapshot } from "../types";

interface ProjectsState {
  projects: Project[];
  activeProjectId: string | null;
  loaded: boolean;
  snapshots: Record<string, RepoSnapshot | undefined>;
  load: () => Promise<void>;
  setActiveProject: (id: string | null) => Promise<void>;
  add: (
    name: string,
    path: string,
    buildCommand?: string | null,
    devCommand?: string | null,
    devPort?: number | null
  ) => Promise<Project>;
  update: (project: Project) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refreshSnapshot: (id: string) => Promise<RepoSnapshot | undefined>;
  refreshAll: () => Promise<void>;
}

let listenersInitialized = false;

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  loaded: false,
  snapshots: {},

  load: async () => {
    try {
      const [projects, activeId] = await Promise.all([
        ipc.getProjects(),
        ipc.getActiveProject(),
      ]);
      set({
        projects,
        activeProjectId: activeId ?? (projects.length > 0 ? projects[0].id : null),
        loaded: true,
      });

      if (!listenersInitialized) {
        listenersInitialized = true;
        void listen<Project[]>("devpilot:projects-updated", (e) => {
          set({ projects: e.payload });
        });
        void listen<RepoSnapshot>("devpilot:snapshot-updated", (e) => {
          const snap = e.payload;
          if (snap?.projectId) {
            set((s) => ({ snapshots: { ...s.snapshots, [snap.projectId]: snap } }));
          }
        });
        void listen<string | null>("devpilot:active-project", (e) => {
          set({ activeProjectId: e.payload });
        });
      }
    } catch (e) {
      console.error("failed to load projects", e);
      set({ loaded: true });
    }
  },

  setActiveProject: async (id: string | null) => {
    set({ activeProjectId: id });
    try {
      await ipc.setActiveProject(id);
    } catch (e) {
      console.error("failed to set active project", e);
    }
  },

  add: async (name, path, buildCommand, devCommand, devPort) => {
    const project = await ipc.addProject(name, path, buildCommand, devCommand, devPort);
    const existing = get().projects.filter((p) => p.id !== project.id);
    const next = [...existing, project];
    set({
      projects: next,
      activeProjectId: get().activeProjectId ?? project.id,
    });
    return project;
  },

  update: async (project) => {
    const updated = await ipc.updateProject(project);
    set({
      projects: get().projects.map((p) => (p.id === updated.id ? updated : p)),
    });
  },

  remove: async (id) => {
    await ipc.removeProject(id);
    const snapshots = { ...get().snapshots };
    delete snapshots[id];
    const remaining = get().projects.filter((p) => p.id !== id);
    const nextActive = get().activeProjectId === id
      ? (remaining.length > 0 ? remaining[0].id : null)
      : get().activeProjectId;
    set({
      projects: remaining,
      snapshots,
      activeProjectId: nextActive,
    });
  },

  refreshSnapshot: async (id) => {
    try {
      const snap = await ipc.getRepoSnapshot(id);
      set((s) => ({ snapshots: { ...s.snapshots, [id]: snap } }));
      return snap;
    } catch (e) {
      console.error(`failed to refresh snapshot ${id}`, e);
      return undefined;
    }
  },

  refreshAll: async () => {
    for (const p of get().projects) {
      if (p.monitoring) {
        await get().refreshSnapshot(p.id);
      }
    }
  },
}));