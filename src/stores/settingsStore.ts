import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../lib/ipc";
import type { AppSettings } from "../types";

export const DEFAULT_SETTINGS: AppSettings = {
  autostart: false,
  startMinimized: false,
  minimizeToTray: true,
  showIsland: true,
  islandSize: "normal",
  dockPosition: "top",
  animation: true,
  autoHideDelay: 3,
  monitoringEnabled: true,
  pollingInterval: 5,
  remoteMonitoringEnabled: true,
  remotePollingInterval: 300,
  notifyOnRemoteCommits: true,
  notifyOnPullRequests: true,
  notifyOnCiFailures: true,
  cpuMonitoring: false,
  ramMonitoring: false,
  networkMonitoring: false,
  notificationSound: true,
  customNotificationSound: null,
};

export const POLLING_OPTIONS = [1, 2, 5, 10, 30, 60] as const;
export const REMOTE_POLLING_OPTIONS = [60, 120, 300, 600, 900, 1800] as const;
export const AUTO_HIDE_OPTIONS = [0, 1, 2, 3, 5, 10] as const;

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  /** Mirror a dock edge chosen by dragging, without re-snapping the island. */
  mirrorDock: (edge: AppSettings["dockPosition"]) => Promise<void>;
  applyExternal: (settings: AppSettings) => void;
}

let subscribed = false;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  load: async () => {
    try {
      const settings = await ipc.getSettings();
      set({ settings: { ...DEFAULT_SETTINGS, ...settings }, loaded: true });
    } catch {
      set({ settings: DEFAULT_SETTINGS, loaded: true });
    }
    if (!subscribed) {
      subscribed = true;
      // The Rust side owns a few settings (tray toggle, autostart). Keep in sync.
      void listen<AppSettings>("devpilot:settings-updated", (e) => {
        set({ settings: { ...DEFAULT_SETTINGS, ...e.payload } });
      });
    }
  },

  update: async (patch) => {
    const prev = get().settings;
    const next = { ...prev, ...patch };
    set({ settings: next });
    try {
      await ipc.saveSettings(next);
    } catch (e) {
      console.error("failed to save settings", e);
    }
    await applySettingsPatch(prev, next);
  },

  mirrorDock: async (edge) => {
    if (get().settings.dockPosition === edge) return;
    const next = { ...get().settings, dockPosition: edge };
    set({ settings: next });
    try {
      await ipc.saveSettings(next);
    } catch (e) {
      console.error("failed to persist dock position", e);
    }
  },

  applyExternal: (settings) => {
    set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  },
}));

/**
 * Side effects for settings that must change Dev Pilot's behaviour the moment
 * they are toggled — no restart, no "Apply" button.
 */
export async function applySettingsPatch(prev: AppSettings, next: AppSettings) {
  const edgeChanged = prev.dockPosition !== next.dockPosition;
  const sizeChanged = prev.islandSize !== next.islandSize;
  const visibilityChanged = prev.showIsland !== next.showIsland;

  if (edgeChanged || sizeChanged) {
    // Re-anchor the island on its current monitor/offset using the new edge
    // and/or size. `dock_island` recomputes the rect from the settings.
    const { useDockStore } = await import("./dockStore");
    try {
      // Read the persisted dock state from Rust so a drag performed in the
      // island window is never stale here.
      const current = await ipc.getDockState();
      const state = await ipc.dockIsland(next.dockPosition, current.monitor, current.offset, "icon");
      useDockStore.getState().setDock(state);
    } catch (e) {
      console.error("failed to apply island geometry", e);
    }
  }

  if (visibilityChanged) {
    if (next.showIsland) {
      try {
        await ipc.showIsland();
      } catch (e) {
        console.error("failed to show island", e);
      }
    }
    // Hiding is handled by the save_settings command.
  }

  const monitoringChanged =
    prev.cpuMonitoring !== next.cpuMonitoring ||
    prev.ramMonitoring !== next.ramMonitoring ||
    prev.networkMonitoring !== next.networkMonitoring;
  if (monitoringChanged) {
    // Start/stop the collectors immediately so the Command Center reflects the
    // new configuration without waiting for the next refresh tick.
    const { useSystemStore } = await import("./systemStore");
    void useSystemStore.getState().refreshStats();
  }
}
