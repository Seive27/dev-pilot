import React from "react";
import ReactDOM from "react-dom/client";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./styles.css";
import App from "./App";
import { useEventsStore } from "./stores/eventsStore";
import { useProjectsStore } from "./stores/projectsStore";
import { useSettingsStore } from "./stores/settingsStore";
import { useDockStore } from "./stores/dockStore";
import { useSystemStore } from "./stores/systemStore";
import { useUiStore } from "./stores/uiStore";

async function bootstrap() {
  await Promise.all([
    useSettingsStore.getState().load(),
    useProjectsStore.getState().load(),
    useEventsStore.getState().load(),
    useDockStore.getState().load(),
  ]);

  await useEventsStore.getState().subscribe();

  // Tray → navigate to a project.
  await listen<string>("devpilot:tray-project", (e) => {
    useUiStore.getState().openProject(e.payload);
    useProjectsStore.getState().refreshSnapshot(e.payload);
  });

  // Tray → open a specific page.
  await listen<string>("devpilot:navigate", (e) => {
    useUiStore.getState().navigate(e.payload as never);
  });

  // Lightweight background refresh while the command center is open.
  // Respects the user's monitoring configuration — nothing runs while disabled.
  setInterval(() => {
    if (getCurrentWindow().label !== "command-center") return;
    const settings = useSettingsStore.getState().settings;
    if (settings.monitoringEnabled) {
      void useProjectsStore.getState().refreshAll();
    }
    void useSystemStore.getState().refreshBuilds();
    void useSystemStore.getState().refreshDevServers();
    if (settings.cpuMonitoring || settings.ramMonitoring || settings.networkMonitoring) {
      void useSystemStore.getState().refreshStats();
    }
  }, 15000);
}

bootstrap();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);