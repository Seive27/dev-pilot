import { useEffect } from "react";
import { Play, Square, TerminalSquare } from "lucide-react";
import { useProjectsStore } from "../stores/projectsStore";
import { useSystemStore } from "../stores/systemStore";
import { useUiStore } from "../stores/uiStore";
import { Button, EmptyState, Mono, Section, StatusDot } from "../components/ui";
import { cx } from "../lib/utils";

export function ProcessesPage() {
  const projects = useProjectsStore((s) => s.projects);
  const devServers = useSystemStore((s) => s.devServers);
  const refreshDevServers = useSystemStore((s) => s.refreshDevServers);
  const startDev = useSystemStore((s) => s.startDev);
  const stopDev = useSystemStore((s) => s.stopDev);
  const toast = useUiStore((s) => s.toast);

  useEffect(() => {
    refreshDevServers();
    const t = setInterval(refreshDevServers, 4000);
    return () => clearInterval(t);
  }, [refreshDevServers]);

  const configured = projects.filter((p) => p.settings.devCommand);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-sm font-semibold text-text">Processes</h1>
            <div className="mt-0.5 text-xs text-muted">Detected development servers</div>
          </div>
          <Button size="sm" onClick={refreshDevServers}>
            Refresh
          </Button>
        </div>

        {configured.length === 0 ? (            <EmptyState
              title="No dev servers configured"
              description="Provide a dev command (e.g. npm run dev) when registering a project to monitor and control its dev server here."
            />
        ) : (
          <div className="mt-4">
            <Section title="Dev Servers">
              <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border bg-surface">
                {devServers.map((d) => {
                  const running = d.status === "running";
                  const starting = d.status === "starting";
                  return (
                    <div key={d.projectId} className="flex items-center gap-3 px-3 py-2">
                      <TerminalSquare className="h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-xs font-medium text-text">{d.projectName}</span>
                          {d.command && <Mono className="truncate text-muted">{d.command}</Mono>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[11px]">
                          <span
                            className={cx(
                              running && "text-success",
                              starting && "text-secondary",
                              d.status === "crashed" && "text-error",
                              !running && !starting && d.status !== "crashed" && "text-muted"
                            )}
                          >
                            {running ? "● Running" : starting ? "… Starting" : d.status === "crashed" ? "× Crashed" : "○ Stopped"}
                          </span>
                          {d.port && <Mono className="text-muted">localhost:{d.port}</Mono>}
                          {d.detected && <span className="text-[10px] text-muted">detected on port</span>}
                        </div>
                      </div>
                      {running ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Square className="h-3 w-3" />}
                          onClick={async () => {
                            try {
                              await stopDev(d.projectId);
                            } catch (e) {
                              toast(String(e), { variant: "error" });
                            }
                          }}
                        >
                          Stop
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          icon={<Play className="h-3 w-3" />}
                          disabled={starting}
                          onClick={async () => {
                            try {
                              await startDev(d.projectId);
                            } catch (e) {
                              toast(String(e), { variant: "error" });
                            }
                          }}
                        >
                          Start
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            <div className="mt-4 text-[11px] text-muted">
              Dev servers are detected by probing their configured port. Stopping kills the process tree
              (taskkill /T /F). Dev Pilot never launches processes without your action.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}