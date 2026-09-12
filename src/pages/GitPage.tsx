import { useEffect, useState } from "react";
import { ArrowUp, Download } from "lucide-react";
import { ipc } from "../lib/ipc";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import { ActivityItem } from "../components/ActivityItem";
import { useEventsStore } from "../stores/eventsStore";
import { Button, EmptyState, Mono, Section, Select } from "../components/ui";
import { cx, relativeTime, shortHash } from "../lib/utils";

export function GitPage() {
  const projects = useProjectsStore((s) => s.projects);
  const snapshots = useProjectsStore((s) => s.snapshots);
  const refreshSnapshot = useProjectsStore((s) => s.refreshSnapshot);
  const toast = useUiStore((s) => s.toast);
  const requestConfirm = useUiStore((s) => s.requestConfirm);
  const events = useEventsStore((s) => s.events);
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && projects.length > 0) {
      setSelected(projects[0].id);
    }
  }, [projects, selected]);

  const snap = snapshots[selected];
  const projectEvents = events.filter((e) => e.projectId === selected).slice(0, 4);

  const run = async (action: "fetch" | "pull" | "push") => {
    if (!selected) return;
    setBusy(action);
    try {
      if (action === "fetch") await ipc.gitFetch(selected);
      if (action === "pull") await ipc.gitPull(selected);
      if (action === "push") await ipc.gitPush(selected);
      toast(`${action} started`);
      setTimeout(() => refreshSnapshot(selected), 2500);
    } catch (e) {
      toast(`${action} failed`, { detail: String(e), variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const files = snap?.files ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex-1 px-5 py-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-sm font-semibold text-text">Git</h1>
            <div className="mt-0.5 text-xs text-muted">Repository status and remote actions</div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selected}
              onChange={setSelected}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Button size="sm" onClick={() => run("fetch")} disabled={!selected || busy !== null}>
              <Download className="h-3 w-3" /> Fetch
            </Button>
            <Button
              size="sm"
              onClick={() =>
                requestConfirm({
                  title: "Pull?",
                  message: "Fast-forward the current branch from its remote.",
                  confirmLabel: "Pull",
                  onConfirm: () => run("pull"),
                })
              }
              disabled={!selected || busy !== null}
            >
              <ArrowUp className="h-3 w-3 rotate-180" /> Pull
            </Button>
            <Button
              size="sm"
              onClick={() =>
                requestConfirm({
                  title: "Push?",
                  message: "Push the current branch to its remote.",
                  confirmLabel: "Push",
                  danger: true,
                  onConfirm: () => run("push"),
                })
              }
              disabled={!selected || busy !== null}
            >
              <ArrowUp className="h-3 w-3" /> Push
            </Button>
          </div>
        </div>

        {!snap ? (
          <EmptyState title="Select a project" description="Choose a repository above to inspect its Git state." />
        ) : !snap.ok ? (
          <EmptyState title="Repository unavailable" description={snap.error ?? undefined} />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Section title="Status">
                <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border bg-surface">
                  {files.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted">Working tree is clean.</div>
                  ) : (
                    files.slice(0, 60).map((f, i) => {
                      const staged = f.status.startsWith("M") || f.status.startsWith("A") || f.status.startsWith("D") || f.status.startsWith("R");
                      const conflicted = f.status.includes("U");
                      return (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-1.5 font-mono text-[11.5px]">
                          <span className={cx(conflicted ? "text-error" : staged ? "text-success" : "text-warning")}>
                            {conflicted ? "!!" : staged ? f.status[0] : f.status[1] || f.status[0]}
                          </span>
                          <span className="truncate text-secondary">{f.path}</span>
                        </div>
                      );
                    })
                  )}
                  {files.length > 60 && (
                    <div className="px-3 py-1.5 text-[10px] text-muted">… {files.length - 60} more files</div>
                  )}
                </div>
              </Section>

              <div className="flex flex-col gap-4">
                <Section title="Branch">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                    <Mono className="text-text">{snap.branch ?? "detached HEAD"}</Mono>
                    {snap.upstream && <Mono className="text-muted">→ {snap.upstream}</Mono>}
                    <span className="ml-auto flex gap-3 font-mono text-[11px]">
                      <span className={snap.ahead > 0 ? "text-warning" : "text-muted"}>{snap.ahead}↑</span>
                      <span className={snap.behind > 0 ? "text-warning" : "text-muted"}>{snap.behind}↓</span>
                    </span>
                  </div>
                  {snap.rebasing && <div className="mt-2 text-[11px] text-warning">Rebase in progress</div>}
                  {snap.stashCount > 0 && (
                    <div className="mt-1 text-[11px] text-muted">{snap.stashCount} stash{snap.stashCount === 1 ? "" : "es"}</div>
                  )}
                </Section>

                <Section title="Commits">
                  <div className="flex flex-col rounded-md border border-border bg-surface p-1">
                    {snap.commits.slice(0, 8).map((c) => (
                      <div key={c.hash} className="flex items-baseline gap-2.5 px-2 py-1.5">
                        <Mono className="text-secondary">{shortHash(c.hash)}</Mono>
                        <span className="min-w-0 flex-1 truncate text-xs text-text">{c.subject}</span>
                        <span className="hidden shrink-0 text-[10px] text-muted lg:inline">{c.author}</span>
                        <span className="shrink-0 text-[10px] text-muted">{relativeTime(c.iso)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </div>

            {projectEvents.length > 0 && (
              <Section title="Recent Git Activity" className="mt-4">
                <div className="flex flex-col rounded-md border border-border bg-surface">
                  {projectEvents.map((e) => (
                    <ActivityItem key={e.id} event={e} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}