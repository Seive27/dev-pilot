import {
  Activity,
  FolderGit2,
  Hammer,
  LayoutGrid,
  Settings,
  SquareTerminal,
  Waypoints,
} from "lucide-react";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import type { Page } from "../types";
import { cx } from "../lib/utils";
import { Logo } from "./Logo";

const NAV: { page: Page; label: string; icon: typeof LayoutGrid }[] = [
  { page: "overview", label: "Overview", icon: LayoutGrid },
  { page: "projects", label: "Projects", icon: FolderGit2 },
  { page: "activity", label: "Activity", icon: Activity },
  { page: "git", label: "Git", icon: Waypoints },
  { page: "builds", label: "Builds", icon: Hammer },
  { page: "processes", label: "Processes", icon: SquareTerminal },
  { page: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const page = useUiStore((s) => s.page);
  const navigate = useUiStore((s) => s.navigate);
  const projectCount = useProjectsStore((s) => s.projects.length);

  return (
    <nav className="flex w-[158px] shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <Logo size={16} />
        <span className="text-[11px] font-semibold tracking-[0.14em] text-text">DEV PILOT</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        {NAV.map(({ page: p, label, icon: Icon }) => (
          <button
            key={p}
            onClick={() => navigate(p)}
            className={cx(
              "relative flex w-full items-center gap-2.5 px-3 py-[6px] text-left text-[12px] transition-colors duration-100",
              page === p ? "text-text" : "text-secondary hover:text-text"
            )}
          >
            {page === p && (
              <span className="absolute left-0 top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded-full bg-text" />
            )}
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span className={cx("font-medium", page === p && "font-semibold")}>{label}</span>
            {p === "projects" && projectCount > 0 && (
              <span className="ml-auto rounded bg-surface-3 px-1.5 py-px font-mono text-[10px] text-muted">
                {projectCount}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="border-t border-border px-3 py-2 text-[9.5px] leading-relaxed text-muted">
        Monitoring local repositories
        <br />
        Ctrl+Shift+P opens this window
      </div>
    </nav>
  );
}
