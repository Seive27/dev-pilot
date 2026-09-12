import { useEffect, useState } from "react";
import { Eye, Hammer, Loader2 } from "lucide-react";
import { useProjectsStore } from "../stores/projectsStore";
import { useSystemStore } from "../stores/systemStore";
import { useUiStore } from "../stores/uiStore";
import { BuildLogDialog } from "../components/BuildLogDialog";
import { Button, EmptyState, Mono, Section, StatusDot } from "../components/ui";
import { relativeTime } from "../lib/utils";
import type { BuildState } from "../types";

export function BuildsPage() {
  const projects = useProjectsStore((s) => s.projects);
  const builds = useSystemStore((s) => s.builds);
  const refreshBuilds = useSystemStore((s) => s.refreshBuilds);
  const runBuild = useSystemStore((s) => s.runBuild);
  const toast = useUiStore((s) => s.toast);
  const [viewing, setViewing] = useState<BuildState | null>(null);

  useEffect(() => {
    refreshBuilds();
    const t = setInterval(refreshBuilds, 5000);
    return () => clearInterval(t);
  }, [refreshBuilds]);

  const withBuild = projects.map((p) => builds.find((b) => b.projectId === p.id)).filter(Boolean) as BuildState[];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-sm font-semibold text-text">Builds</h1>
            <div className="mt-0.5 text-xs text-muted">
              Projects with a build command configured
            </div>
          </div>
          <Button size="sm" onClick={refreshBuilds}>
            Refresh
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {withBuild.length === 0 ? (
            <EmptyState
              title="No builds configured"
              description="Provide a build command (e.g. npm run build) when registering a project to track its builds here."
            />
          ) : (
            withBuild.map((b) => (
              <div key={b.projectId} className="rounded-md border border-border bg-surface">
                <div className="flex items-center gap-3 px-3 py-2">
                  {b.status === "building" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-secondary" />
                  ) : b.status === "success" ? (
                    <StatusDot tone="ok" />
                  ) : b.status === "failed" ? (
                    <StatusDot tone="err" />
                  ) : (
                    <StatusDot tone="idle" />
                  )}
                  <span className="text-[13px] font-medium text-text">{b.projectName}</span>
                  <Mono className="text-muted">
                    {b.status === "success"
                      ? "✓ Build OK"
                      : b.status === "failed"
                      ? "× Build failed"
                      : b.status === "building"
                      ? "Building…"
                      : "Idle"}
                  </Mono>
                  {b.finishedAt && <span className="text-[11px] text-muted">{relativeTime(b.finishedAt)}</span>}
                  <div className="ml-auto flex items-center gap-1.5">
                    {b.log.length > 0 && (
                      <Button size="sm" variant="ghost" icon={<Eye className="h-3 w-3" />} onClick={() => setViewing(b)}>
                        Log
                      </Button>
                    )}
                    <Button
                      size="sm"
                      icon={<Hammer className="h-3 w-3" />}
                      disabled={b.status === "building"}
                      onClick={async () => {
                        try {
                          await runBuild(b.projectId);
                        } catch (e) {
                          toast(String(e), { variant: "error" });
                        }
                      }}
                    >
                      {b.status === "building" ? "Building…" : "Build"}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {viewing && <BuildLogDialog build={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}