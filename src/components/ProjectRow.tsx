import { ChevronRight, FolderX, GitBranch } from "lucide-react";
import type { Project, RepoSnapshot } from "../types";
import { Mono, StatusDot } from "./ui";
import { cx } from "../lib/utils";

export function statusSummary(snap: RepoSnapshot | undefined): {
  text: string;
  tone: "ok" | "warn" | "err" | "idle";
} {
  if (!snap) {
    return { text: "—", tone: "idle" };
  }
  if (!snap.ok) {
    return { text: "Unavailable", tone: "err" };
  }
  if (snap.conflictCount > 0) {
    return { text: `${snap.conflictCount} conflicts`, tone: "err" };
  }
  if (snap.modifiedCount > 0 || snap.untrackedCount > 0 || snap.stagedCount > 0) {
    const parts: string[] = [];
    if (snap.modifiedCount > 0) parts.push(`${snap.modifiedCount} modified`);
    if (snap.stagedCount > 0) parts.push(`${snap.stagedCount} staged`);
    if (snap.untrackedCount > 0) parts.push(`${snap.untrackedCount} untracked`);
    if (snap.behind > 0) parts.push(`↓${snap.behind}`);
    return { text: parts.join(" · "), tone: "warn" };
  }
  if (snap.behind > 0) {
    return { text: `${snap.behind} behind remote`, tone: "warn" };
  }
  if (snap.ahead > 0) {
    return { text: `${snap.ahead} ahead`, tone: "ok" };
  }
  return { text: "Clean", tone: "ok" };
}

export function ProjectRow({
  project,
  snapshot,
  buildStatus,
  devStatus,
  onClick,
}: {
  project: Project;
  snapshot?: RepoSnapshot;
  buildStatus?: string;
  devStatus?: string;
  onClick?: () => void;
}) {
  const status = statusSummary(snapshot);
  const unavailable = snapshot && !snapshot.ok;

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors duration-100 hover:border-border hover:bg-surface-2"
    >
      <div className="flex w-2 shrink-0 justify-center">
        {unavailable ? (
          <FolderX className="h-3.5 w-3.5 text-error" />
        ) : (
          <StatusDot tone={status.tone} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[13px] font-medium text-text">{project.name}</span>
          <span className="inline-flex items-center gap-1 text-muted">
            <GitBranch className="h-3 w-3" />
            <Mono>{snapshot?.ok ? snapshot.branch ?? "detached" : "—"}</Mono>
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px]">
          <span className={cx(status.tone === "err" && "text-error", status.tone === "warn" && "text-warning", status.tone === "ok" && "text-success", status.tone === "idle" && "text-muted")}>
            {status.text}
          </span>
          {buildStatus && buildStatus !== "idle" && (
            <span
              className={cx(
                buildStatus === "success" && "text-success",
                buildStatus === "failed" && "text-error",
                buildStatus === "building" && "text-secondary"
              )}
            >
              {buildStatus === "success" ? "✓ build" : buildStatus === "failed" ? "× build" : "… building"}
            </span>
          )}
          {devStatus && (
            <span className={cx(devStatus === "running" ? "text-success" : "text-muted")}>
              {devStatus === "running" ? "● dev" : "○ dev"}
            </span>
          )}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-secondary" />
    </button>
  );
}