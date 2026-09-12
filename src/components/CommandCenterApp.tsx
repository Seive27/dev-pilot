import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ipc } from "../lib/ipc";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";
import { Toasts } from "./Toasts";
import { ConfirmDialog } from "./ConfirmDialog";
import { useUiStore } from "../stores/uiStore";
import { OverviewPage } from "../pages/OverviewPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ActivityPage } from "../pages/ActivityPage";
import { GitPage } from "../pages/GitPage";
import { BuildsPage } from "../pages/BuildsPage";
import { ProcessesPage } from "../pages/ProcessesPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";

import { useProjectsStore } from "../stores/projectsStore";

export function CommandCenterApp() {
  const page = useUiStore((s) => s.page);
  const selectedProjectId = useUiStore((s) => s.selectedProjectId);
  const navigate = useUiStore((s) => s.navigate);
  const openProject = useUiStore((s) => s.openProject);
  const loadProjects = useProjectsStore((s) => s.load);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Remember the window's size and position so it reopens exactly as the user
  // left it. The Rust side validates the saved rect against live monitors.
  useEffect(() => {
    const win = getCurrentWindow();
    let timer: number | undefined;
    const save = async () => {
      try {
        const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
        await ipc.saveCommandCenterRect(pos.x, pos.y, size.width, size.height);
      } catch {
        // ignore — geometry is a nicety, never a failure
      }
    };
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(save, 450);
    };
    const handles = Promise.all([win.onMoved(debounced), win.onResized(debounced)]);
    return () => {
      if (timer) clearTimeout(timer);
      void handles.then((fns) => fns.forEach((fn) => fn()));
    };
  }, []);

  useEffect(() => {
    // Global shortcut hint: Ctrl+Shift+P shows the command center from anywhere.
    const unlisten = listen<string>("devpilot:navigate", (e) => {
      navigate(e.payload as never);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [navigate]);

  useEffect(() => {
    const unlisten = listen<string>("devpilot:tray-project", (e) => {
      openProject(e.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openProject]);

  useEffect(() => {
    const win = getCurrentWindow();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void win.show();
        void win.setFocus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showDetail = page === "projects" && selectedProjectId;

  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 bg-bg">
          {showDetail ? (
            <ProjectDetailPage projectId={selectedProjectId!} />
          ) : page === "overview" ? (
            <OverviewPage onOpenProject={openProject} />
          ) : page === "projects" ? (
            <ProjectsPage onOpenProject={openProject} />
          ) : page === "activity" ? (
            <ActivityPage />
          ) : page === "git" ? (
            <GitPage />
          ) : page === "builds" ? (
            <BuildsPage />
          ) : page === "processes" ? (
            <ProcessesPage />
          ) : (
            <SettingsPage />
          )}
        </main>
      </div>
      <Toasts />
      <ConfirmDialog />
    </div>
  );
}