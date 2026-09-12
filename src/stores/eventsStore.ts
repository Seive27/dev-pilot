import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";
import type { DevPilotEvent } from "../types";

interface EventsState {
  events: DevPilotEvent[];
  loaded: boolean;
  load: () => Promise<void>;
  addEvent: (event: DevPilotEvent) => void;
  subscribe: () => Promise<() => void>;
}

export const useEventsStore = create<EventsState>((set, get) => ({
  events: [],
  loaded: false,

  load: async () => {
    try {
      const events = await ipc.getTimeline();
      set({ events, loaded: true });
    } catch (e) {
      console.error("failed to load timeline", e);
      set({ loaded: true });
    }
  },

  addEvent: (event) => {
    set((s) => {
      const next = [event, ...s.events];
      return { events: next.slice(0, 300) };
    });
  },

  subscribe: async () => {
    return listen<DevPilotEvent>("devpilot:event", (e) => {
      get().addEvent(e.payload);
    });
  },
}));