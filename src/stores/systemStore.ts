import { create } from "zustand";
import { ipc } from "../lib/ipc";
import type { BuildState, DevServerState, SystemStats } from "../types";

interface SystemState {
  stats: SystemStats;
  builds: BuildState[];
  devServers: DevServerState[];
  refreshStats: () => Promise<void>;
  refreshBuilds: () => Promise<void>;
  refreshDevServers: () => Promise<void>;
  runBuild: (id: string) => Promise<void>;
  startDev: (id: string) => Promise<void>;
  stopDev: (id: string) => Promise<void>;
}

export const useSystemStore = create<SystemState>((set, get) => ({
  stats: {
    cpuEnabled: false,
    ramEnabled: false,
    networkEnabled: false,
    cpuPercent: 0,
    ramPercent: 0,
    ramUsedGb: 0,
    ramTotalGb: 0,
    netRxKbps: 0,
    netTxKbps: 0,
  },
  builds: [],
  devServers: [],

  refreshStats: async () => {
    try {
      const stats = await ipc.getSystemStats();
      set({ stats });
    } catch {
      // ignore
    }
  },

  refreshBuilds: async () => {
    try {
      const builds = await ipc.getBuilds();
      set({ builds });
    } catch {
      // ignore
    }
  },

  refreshDevServers: async () => {
    try {
      const devServers = await ipc.getDevServers();
      set({ devServers });
    } catch {
      // ignore
    }
  },

  runBuild: async (id) => {
    await ipc.startBuild(id);
    await get().refreshBuilds();
  },

  startDev: async (id) => {
    await ipc.startDevServer(id);
    await get().refreshDevServers();
  },

  stopDev: async (id) => {
    await ipc.stopDevServer(id);
    await get().refreshDevServers();
  },
}));