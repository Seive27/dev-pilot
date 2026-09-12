import type { DevPilotEvent } from "../types";
import { Mono } from "./ui";
import { cx, timeOfDay } from "../lib/utils";

const dotForSeverity: Record<string, string> = {
  low: "dot dot-idle",
  medium: "dot dot-idle",
  high: "dot dot-warn",
  critical: "dot dot-err",
};

export function ActivityItem({
  event,
  showProject,
}: {
  event: DevPilotEvent;
  showProject?: boolean;
}) {
  const isRemote =
    event.type.startsWith("REMOTE_") ||
    event.type.startsWith("PULL_REQUEST") ||
    event.type.startsWith("REVIEW_") ||
    event.type === "CI_FAILED" ||
    (event.metadata && (event.metadata.source === "remote" || event.metadata.source === "github"));

  return (
    <div className="flex items-start gap-3 px-2.5 py-2">
      <span className={cx("mt-[5px]", dotForSeverity[event.severity] ?? "dot dot-idle")} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-text">{event.title}</span>
          {isRemote && (
            <span className="shrink-0 rounded-full border border-border px-1.5 py-px font-mono text-[9px] uppercase text-muted">
              remote
            </span>
          )}
          {showProject && event.projectName && (
            <span className="shrink-0 text-[11px] text-muted">{event.projectName}</span>
          )}
        </div>
        {event.description && (
          <div className="mt-0.5 truncate font-mono text-[11px] text-secondary">{event.description}</div>
        )}
      </div>
      <Mono className="shrink-0 text-[11px] text-muted">{timeOfDay(event.timestamp)}</Mono>
    </div>
  );
}