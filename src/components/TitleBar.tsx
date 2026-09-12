import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useUiStore } from "../stores/uiStore";

const TITLES: Record<string, string> = {
  overview: "Overview",
  projects: "Projects",
  activity: "Activity",
  git: "Git",
  builds: "Builds",
  processes: "Processes",
  settings: "Settings",
};

export function TitleBar() {
  const appWindow = getCurrentWindow();
  const page = useUiStore((s) => s.page);
  const selectedProjectId = useUiStore((s) => s.selectedProjectId);

  return (
    <div className="titlebar flex h-9 shrink-0 items-center justify-between border-b border-border bg-surface pl-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold text-text">
          {page === "projects" && selectedProjectId ? "Project" : TITLES[page] ?? "Dev Pilot"}
        </span>
        <span className="text-[10px] text-muted">Dev Pilot</span>
      </div>
      <div className="flex h-full items-center">
        <button
          className="flex h-full w-10 items-center justify-center text-secondary transition-colors hover:bg-surface-2 hover:text-text"
          title="Minimize"
          onClick={() => appWindow.minimize()}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          className="flex h-full w-10 items-center justify-center text-secondary transition-colors hover:bg-surface-2 hover:text-text"
          title="Maximize"
          onClick={() => appWindow.toggleMaximize()}
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          className="flex h-full w-10 items-center justify-center text-secondary transition-colors hover:bg-error/15 hover:text-error"
          title="Close"
          onClick={() => ipc.closeCommandCenter()}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function useNavigate() {
  return useUiStore((s) => s.navigate);
}
