import { create } from "zustand";
import { ipc } from "../lib/ipc";
import type { DockEdge, DockState, MonitorInfo } from "../types";

interface DragHint {
  edge: DockEdge;
  monitorId: string;
  active: boolean;
}

interface DockStateStore {
  dock: DockState;
  monitors: MonitorInfo[];
  dragHint: DragHint;
  load: () => Promise<void>;
  refreshMonitors: () => Promise<void>;
  setDragHint: (hint: DragHint) => void;
  setDock: (dock: DockState) => void;
}

const DEFAULT_DOCK: DockState = {
  edge: "top",
  monitor: "",
  offset: 0.5,
  expanded: false,
};

export const useDockStore = create<DockStateStore>((set) => ({
  dock: DEFAULT_DOCK,
  monitors: [],
  dragHint: { edge: "top", monitorId: "", active: false },

  load: async () => {
    try {
      const [dock, monitors] = await Promise.all([
        ipc.getDockState(),
        ipc.getScreenLayout(),
      ]);
      set({ dock, monitors });
    } catch (e) {
      console.error("failed to load dock state", e);
    }
  },

  refreshMonitors: async () => {
    try {
      const monitors = await ipc.getScreenLayout();
      set({ monitors });
    } catch {
      // keep previous layout
    }
  },

  setDragHint: (hint) => set({ dragHint: hint }),
  setDock: (dock) => set({ dock }),
}));