import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  ArrowUp,
  Download,
  FolderOpen,
  GitBranch,
  Hammer,
  Play,
  RefreshCw,
  SquareTerminal,
  Terminal,
  Trash2,
} from "lucide-react";
import { ipc } from "../lib/ipc";
import { useProjectsStore } from "../stores/projectsStore";
import { useSystemStore } from "../stores/systemStore";
import { useUiStore } from "../stores/uiStore";
import { BuildLogDialog } from "../components/BuildLogDialog";
import { ActivityItem } from "../components/ActivityItem";
import { useEventsStore } from "../stores/eventsStore";
import { Button, EmptyState, IconButton, Mono, Section, StatusDot } from "../components/ui";
import { cx, relativeTime, shortHash } from "../lib/utils";

const FILE_STATUS_MARK: Record<string, string> = {
  "??": "?", M: "M", A: "A", D: "D", R: "R", C: "C", U: "U",
};

function fileGlyph(status: string): { mark: string; tone: "ok" | "warn" | "err" | "idle" } {
  if (status.startsWith("?")) return { mark: "?", tone: "idle" };
  if (status.includes("U")) return { mark: "!", tone: "err" };
  if (status.startsWith("M") || status.includes("M")) return { mark: "M", tone: "warn" };
  if (status.startsWith("A") || status.includes("A")) return { mark: "+", tone: "ok" };
  if (status.startsWith("D") || status.includes("D")) return { mark: "−", tone: "err" };
  if (status.startsWith("R") || status.includes("R")) return { mark: "→", tone: "ok" };
  return { mark: FILE_STATUS_MARK[status] ?? "·", tone: "idle" };
}

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const snap = useProjectsStore((s) => s.snapshots[projectId]);
  const refreshSnapshot = useProjectsStore((s) => s.refreshSnapshot);
  const updateProject = useProjectsStore((s) => s.update);
  const removeProject = useProjectsStore((s) => s.remove);
  const navigate = useUiStore((s) => s.navigate);
  const toast = useUiStore((s) => s.toast);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const builds = useSystemStore((s) => s.builds);
  const devServers = useSystemStore((s) => s.devServers);
  const refreshBuilds = useSystemStore((s) => s.refreshBuilds);
  const runBuild = useSystemStore((s) => s.runBuild);
  const startDev = useSystemStore((s) => s.startDev);
  const stopDev = useSystemStore((s) => s.stopDev);
  const events = useEventsStore((s) => s.events);
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const build = builds.find((b) => b.projectId === projectId);
  const dev = devServers.find((d) => d.projectId === projectId);
  const projectEvents = events.filter((e) => e.projectId === projectId).slice(0, 6);

  const refresh = useCallback(async () => {
    await Promise.all([refreshSnapshot(projectId), refreshBuilds()]);
  }, [projectId, refreshSnapshot, refreshBuilds]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          title="Project not found"
          action={<Button onClick={() => navigate("projects")}>Back to Projects</Button>}
        />
      </div>
    );
  }

  const unavailable = !snap || !snap.ok;

  const runGit = async (action: "fetch" | "pull" | "push") => {
    setBusy(action);
    try {
      if (action === "fetch") await ipc.gitFetch(project.id);
      if (action === "pull") await ipc.gitPull(project.id);
      if (action === "push") await ipc.gitPush(project.id);
      toast(`${action} started`, { detail: project.name });
      setTimeout(refresh, 2500);
    } catch (e) {
      toast(`${action} failed`, { detail: String(e), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const confirmThen = (action: "pull" | "push", fn: () => Promise<void>) => {
    requestConfirm({
      title: `${action === "pull" ? "Pull" : "Push"} ${project.name}?`,
      message: action === "push" ? "This will push the current branch to its remote." : "This will fast-forward the current branch from its remote.",
      confirmLabel: action === "push" ? "Push" : "Pull",
      danger: action === "push",
      onConfirm: fn,
    });
  };

  const locate = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    try {
      const isGit = await ipc.checkIsGit(selected);
      if (!isGit) {
        toast("This folder is not a Git repository", { variant: "error" });
        return;
      }
      await updateProject({ ...project, path: selected });
      toast("Repository path updated", { variant: "success" });
      refresh();
    } catch (e) {
      toast(String(e), { variant: "error" });
    }
  };

  const remove = () => {
    requestConfirm({
      title: `Remove ${project.name}?`,
      message: "Dev Pilot will stop monitoring this repository. Your files are not touched.",
      confirmLabel: "Remove",
      danger: true,
      onConfirm: async () => {
        await removeProject(project.id);
        navigate("projects");
      },
    });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-5 py-4">
        <button
          onClick={() => navigate("projects")}
          className="mb-4 flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="h-3 w-3" /> Projects
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-sm font-semibold text-text">{project.name}</h1>
              {snap?.ok ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-secondary">
                  <GitBranch className="h-3.5 w-3.5" />
                  <Mono>{snap.branch ?? "detached"}</Mono>
                </span>
              ) : (
                <StatusDot tone="err" />
              )}
            </div>
            <Mono className="mt-1 block text-secondary">{project.path}</Mono>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton title="Open Repository" onClick={() => ipc.openInExplorer(project.path)}>
              <FolderOpen className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Open Terminal" onClick={() => ipc.openTerminal(project.path)}>
              <Terminal className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton title="Refresh" onClick={refresh}>
              <RefreshCw className={cx("h-3.5 w-3.5", busy === "refresh" && "animate-spin")} />
            </IconButton>
            <IconButton title="Remove Project" danger onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        {unavailable ? (
          <div className="mt-4 rounded-md border border-error/30 bg-error/10 p-4">
            <div className="text-sm font-medium text-error">Repository unavailable</div>
            <div className="mt-1 text-xs text-secondary">
              The configured repository path could not be found:
            </div>
            <Mono className="mt-1 block text-error">{project.path}</Mono>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={locate}>
                Locate Repository
              </Button>
              <Button size="sm" variant="danger" onClick={remove}>
                Remove Project
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => runGit("fetch")} disabled={busy !== null}>
                <Download className="h-3 w-3" /> Fetch
              </Button>
              <Button size="sm" onClick={() => confirmThen("pull", () => runGit("pull"))} disabled={busy !== null}>
                <ArrowUp className="h-3 w-3 rotate-180" /> Pull
              </Button>
              <Button size="sm" onClick={() => confirmThen("push", () => runGit("push"))} disabled={busy !== null}>
                <ArrowUp className="h-3 w-3" /> Push
              </Button>
              {project.settings.buildCommand && (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await runBuild(project.id);
                    } catch (e) {
                      toast(String(e), { variant: "error" });
                    }
                  }}
                  disabled={build?.status === "building"}
                >
                  <Hammer className="h-3 w-3" /> {build?.status === "building" ? "Building…" : "Build"}
                </Button>
              )}
              {project.settings.devCommand && (
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      if (dev?.status === "running") {
                        await stopDev(project.id);
                      } else {
                        await startDev(project.id);
                      }
                    } catch (e) {
                      toast(String(e), { variant: "error" });
                    }
                  }}
                >
                  <Play className="h-3 w-3" />
                  {dev?.status === "running" ? "Stop Dev Server" : "Start Dev Server"}
                </Button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <Section title="Git Status" className="col-span-1">
                <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3">
                  <Row label="Modified" value={snap?.modifiedCount ?? 0} tone={(snap?.modifiedCount ?? 0) > 0 ? "warn" : undefined} />
                  <Row label="Staged" value={snap?.stagedCount ?? 0} />
                  <Row label="Untracked" value={snap?.untrackedCount ?? 0} tone={(snap?.untrackedCount ?? 0) > 0 ? "warn" : undefined} />
                  <Row label="Conflicts" value={snap?.conflictCount ?? 0} tone={(snap?.conflictCount ?? 0) > 0 ? "err" : undefined} />
                  <div className="mt-1 border-t border-border pt-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-secondary">Ahead / behind</span>
                      <Mono className="text-muted">
                        {snap?.ahead ?? 0}/{snap?.behind ?? 0}
                      </Mono>
                    </div>
                    {snap?.stashCount ? (
                      <div className="mt-1 flex justify-between text-[11px]">
                        <span className="text-secondary">Stashes</span>
                        <Mono className="text-muted">{snap.stashCount}</Mono>
                      </div>
                    ) : null}
                    {snap?.rebasing ? (
                      <div className="mt-1 text-[11px] text-warning">Rebase in progress</div>
                    ) : null}
                  </div>
                </div>
                {snap && snap.files.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-border bg-surface p-1">
                    {snap.files.slice(0, 40).map((f, i) => {
                      const g = fileGlyph(f.status);
                      return (
                        <div key={i} className="flex items-center gap-2 rounded px-2 py-[3px] font-mono text-[11px]">
                          <span
                            className={cx(
                              "w-3 text-center",
                              g.tone === "err" && "text-error",
                              g.tone === "warn" && "text-warning",
                              g.tone === "ok" && "text-success",
                              g.tone === "idle" && "text-muted"
                            )}
                          >
                            {g.mark}
                          </span>
                          <span className="truncate text-secondary">{f.path}</span>
                        </div>
                      );
                    })}
                    {snap.files.length > 40 && (
                      <div className="px-2 py-1 text-[10px] text-muted">… {snap.files.length - 40} more</div>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Recent Commits" className="col-span-1">
                {snap && snap.commits.length > 0 ? (
                  <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-2">
                    {snap.commits.slice(0, 6).map((c) => (
                      <div key={c.hash} className="flex items-baseline gap-2 rounded px-2 py-1.5">
                        <Mono className="text-secondary">{shortHash(c.hash)}</Mono>
                        <span className="min-w-0 flex-1 truncate text-xs text-text">{c.subject}</span>
                        <span className="shrink-0 text-[10px] text-muted">{relativeTime(c.iso)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-border bg-surface px-3 py-4 text-xs text-muted">No commits yet</div>
                )}
                <div className="mt-3">
                  <div className="label-overline mb-1.5">Remote</div>
                  {snap && snap.remotes.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {snap.remotes.map((r, i) => (
                        <Mono key={i} className="truncate text-secondary">
                          {r}
                        </Mono>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted">No remote configured</div>
                  )}
                </div>
              </Section>

              <div className="col-span-1 flex flex-col gap-4">
                <Section title="Stack">
                  {snap && snap.stack.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {snap.stack.map((t) => (
                        <span key={t} className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-secondary">
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted">Not detected</div>
                  )}
                </Section>

                <Section
                  title="Build"
                  right={
                    build?.command ? (
                      <button className="text-[10px] text-muted underline-offset-2 hover:text-secondary hover:underline" onClick={() => setShowLog(true)}>
                        View details
                      </button>
                    ) : undefined
                  }
                >
                  {!project.settings.buildCommand ? (
                    <div className="text-xs text-muted">No build command configured</div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
                      {build?.status === "building" ? (
                        <span className="dot dot-idle animate-pulse" />
                      ) : build?.status === "success" ? (
                        <StatusDot tone="ok" />
                      ) : build?.status === "failed" ? (
                        <StatusDot tone="err" />
                      ) : (
                        <StatusDot tone="idle" />
                      )}
                      <span className="text-xs text-text">
                        {build?.status === "success"
                          ? "Build OK"
                          : build?.status === "failed"
                          ? "Build failed"
                          : build?.status === "building"
                          ? "Building…"
                          : "Idle"}
                      </span>
                      <Mono className="ml-auto text-muted">{build?.command ?? project.settings.buildCommand}</Mono>
                    </div>
                  )}
                </Section>

                <Section title="Dev Server">
                  {!project.settings.devCommand ? (
                    <div className="text-xs text-muted">No dev command configured</div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
                      {dev?.status === "running" ? (
                        <StatusDot tone="ok" />
                      ) : dev?.status === "crashed" ? (
                        <StatusDot tone="err" />
                      ) : (
                        <StatusDot tone="idle" />
                      )}
                      <span className="text-xs text-text">
                        {dev?.status === "running"
                          ? "Running"
                          : dev?.status === "starting"
                          ? "Starting…"
                          : dev?.status === "crashed"
                          ? "Crashed"
                          : "Stopped"}
                      </span>
                      {dev?.status === "running" && dev.port ? (
                        <Mono className="ml-auto text-success">localhost:{dev.port}</Mono>
                      ) : (
                        <SquareTerminal className="ml-auto h-3.5 w-3.5 text-muted" />
                      )}
                    </div>
                  )}
                </Section>
              </div>
            </div>

            <Section title="Activity" className="mt-4">
              {projectEvents.length === 0 ? (
                <div className="px-2.5 py-3 text-xs text-muted">No recorded activity for this project yet.</div>
              ) : (
                <div className="flex flex-col">
                  {projectEvents.map((e) => (
                    <ActivityItem key={e.id} event={e} />
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>

      {showLog && build && <BuildLogDialog build={build} onClose={() => setShowLog(false)} />}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: "warn" | "err" }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-secondary">{label}</span>
      <span className={cx("font-mono", tone === "warn" ? "text-warning" : tone === "err" ? "text-error" : "text-text")}>
        {value}
      </span>
    </div>
  );
}