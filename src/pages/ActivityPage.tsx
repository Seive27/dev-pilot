import { useState } from "react";
import { useEventsStore } from "../stores/eventsStore";
import { useProjectsStore } from "../stores/projectsStore";
import { ActivityItem } from "../components/ActivityItem";
import { EmptyState, Select } from "../components/ui";
import { severityRank } from "../lib/utils";

export function ActivityPage() {
  const events = useEventsStore((s) => s.events);
  const projects = useProjectsStore((s) => s.projects);
  const [originFilter, setOriginFilter] = useState<"all" | "local" | "remote">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const isRemoteEvent = (e: (typeof events)[0]) => {
    const t = e.type;
    return (
      t === "REMOTE_COMMIT" ||
      t === "REMOTE_BRANCH_CHANGED" ||
      t === "PULL_REQUEST_OPENED" ||
      t === "REVIEW_REQUESTED" ||
      t === "PULL_REQUEST_APPROVED" ||
      t === "CHANGES_REQUESTED" ||
      t === "CI_FAILED" ||
      t === "REMOTE_UNAVAILABLE" ||
      (e.metadata && (e.metadata.source === "remote" || e.metadata.source === "github"))
    );
  };

  const filtered = events.filter((e) => {
    if (originFilter === "local" && isRemoteEvent(e)) return false;
    if (originFilter === "remote" && !isRemoteEvent(e)) return false;
    if (projectFilter !== "all" && e.projectId !== projectFilter) return false;
    if (severityFilter !== "all" && severityRank(e.severity) < severityRank(severityFilter)) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-text">Activity</h1>
            <div className="mt-0.5 text-xs text-muted">Live feed across all monitored repositories</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Origin filters: ALL / LOCAL / REMOTE */}
            <div className="flex items-center rounded-md border border-border bg-surface p-0.5 text-xs">
              {(["all", "local", "remote"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setOriginFilter(tab)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                    originFilter === tab
                      ? "bg-surface-3 text-text"
                      : "text-muted hover:text-secondary"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: "all", label: "All projects" },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Select
              value={severityFilter}
              onChange={setSeverityFilter}
              options={[
                { value: "all", label: "All severities" },
                { value: "medium", label: "Medium+" },
                { value: "high", label: "High+" },
                { value: "critical", label: "Critical only" },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 rounded-md border border-border bg-surface">
          {filtered.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Git events, builds, and dev-server changes will stream in here in real time."
            />
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {filtered.slice(0, 200).map((e) => (
                <ActivityItem key={e.id} event={e} showProject />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}