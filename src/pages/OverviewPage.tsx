import { useState } from "react";
import { Plus } from "lucide-react";
import { useEventsStore } from "../stores/eventsStore";
import { useProjectsStore } from "../stores/projectsStore";
import { useSystemStore } from "../stores/systemStore";
import { useUiStore } from "../stores/uiStore";
import { useSettingsStore } from "../stores/settingsStore";
import { ActivityItem } from "../components/ActivityItem";
import { ProjectRow } from "../components/ProjectRow";
import { ProjectPickerDialog } from "../components/ProjectPickerDialog";
import { Button, EmptyState, ProgressBar, Section } from "../components/ui";
import { cx, relativeTime } from "../lib/utils";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "err" }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="label-overline">{label}</span>
      <span
        className={cx(
          "font-mono text-[13px] font-semibold",
          tone === "err" ? "text-error" : tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-text"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: string;
  percent: number;
  tone?: "ok" | "warn" | "err";
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]">
        <span className="text-secondary">{label}</span>
        <span className="font-mono text-muted">{value}</span>
      </div>
      <ProgressBar percent={percent} tone={tone} />
    </div>
  );
}

export function OverviewPage({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const projects = useProjectsStore((s) => s.projects);
  const snapshots = useProjectsStore((s) => s.snapshots);
  const events = useEventsStore((s) => s.events);
  const builds = useSystemStore((s) => s.builds);
  const devServers = useSystemStore((s) => s.devServers);
  const stats = useSystemStore((s) => s.stats);
  const settings = useSettingsStore((s) => s.settings);
  const navigate = useUiStore((s) => s.navigate);
  const [showPicker, setShowPicker] = useState(false);

  const activeDev = devServers.filter((d) => d.status === "running").length;
  const totalChanges = projects.reduce((acc, p) => {
    const s = snapshots[p.id];
    return acc + (s?.ok ? s.modifiedCount + s.stagedCount + s.untrackedCount : 0);
  }, 0);
  const failedBuilds = builds.filter((b) => b.status === "failed").length;
  const anySystem = settings.cpuMonitoring || settings.ramMonitoring || settings.networkMonitoring;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Header + stat strip — one compact band, no wasted height */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1.5">
            <h1 className="text-sm font-semibold text-text">Overview</h1>
            <span className="hidden h-3.5 w-px bg-border-strong sm:block" />
            <Stat label="Projects" value={String(projects.length)} />
            <Stat label="Changes" value={String(totalChanges)} tone={totalChanges > 0 ? "warn" : undefined} />
            <Stat label="Dev" value={String(activeDev)} tone={activeDev > 0 ? "ok" : undefined} />
            <Stat label="Builds failed" value={String(failedBuilds)} tone={failedBuilds > 0 ? "err" : undefined} />
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-3 w-3" />}
            onClick={() => setShowPicker(true)}
          >
            Add Project
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Section title="Projects" className="col-span-2">
            {projects.length === 0 ? (
              <EmptyState
                title="No projects yet"
                description="Add your first Git repository to start monitoring your development activity."
                action={
                  <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowPicker(true)}>
                    Add Project
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-0.5">
                {projects.map((p) => {
                  const build = builds.find((b) => b.projectId === p.id);
                  const dev = devServers.find((d) => d.projectId === p.id);
                  return (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      snapshot={snapshots[p.id]}
                      buildStatus={build?.status}
                      devStatus={dev?.status}
                      onClick={() => onOpenProject(p.id)}
                    />
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="System">
            {!anySystem ? (
              <div className="rounded-md border border-border bg-surface px-3 py-3 text-[11px] leading-relaxed text-muted">
                System monitoring is off.
                <button
                  onClick={() => navigate("settings")}
                  className="ml-1 text-secondary underline-offset-2 hover:text-text hover:underline"
                >
                  Enable it in Settings
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
                {settings.cpuMonitoring && (
                  <Metric
                    label="CPU"
                    value={`${Math.round(stats.cpuPercent)}%`}
                    percent={stats.cpuPercent}
                    tone={stats.cpuPercent > 85 ? "err" : stats.cpuPercent > 60 ? "warn" : undefined}
                  />
                )}
                {settings.ramMonitoring && (
                  <Metric
                    label="Memory"
                    value={`${stats.ramUsedGb.toFixed(1)} / ${stats.ramTotalGb.toFixed(1)} GB`}
                    percent={stats.ramPercent}
                    tone={stats.ramPercent > 85 ? "err" : stats.ramPercent > 60 ? "warn" : undefined}
                  />
                )}
                {settings.networkMonitoring && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-secondary">Network</span>
                    <span className="font-mono text-muted">
                      ↓ {stats.netRxKbps.toFixed(1)} KB/s · ↑ {stats.netTxKbps.toFixed(1)} KB/s
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="mt-2.5 flex flex-col gap-0.5 border-t border-border pt-2 text-[10.5px] leading-relaxed text-muted">
              <span>
                Dock <span className="font-mono text-secondary">{settings.dockPosition}</span> · island{" "}
                <span className="font-mono text-secondary">{settings.islandSize}</span>
              </span>
              <span>
                {settings.monitoringEnabled ? `Polling every ${settings.pollingInterval}s` : "Monitoring paused"}
              </span>
              <span>Last scan {events.length > 0 ? relativeTime(events[0].timestamp) : "—"}</span>
            </div>
          </Section>
        </div>

        <Section title="Recent Activity" className="mt-4">
          {events.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-3 py-3 text-xs text-muted">
              No activity yet. Events will appear here as repositories change.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border bg-surface">
              {events.slice(0, 8).map((e) => (
                <ActivityItem key={e.id} event={e} showProject />
              ))}
            </div>
          )}
        </Section>
      </div>
      {showPicker && <ProjectPickerDialog onClose={() => setShowPicker(false)} />}
    </div>
  );
}
