import { useEffect, useRef, useState, useCallback } from "react";
import {
  ArrowUp,
  Check,
  CheckSquare,
  FileCode,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { ipc } from "../lib/ipc";
import { useProjectsStore } from "../stores/projectsStore";
import { useUiStore } from "../stores/uiStore";
import type { GitWorkflowFile, GitWorkflowStatus } from "../types";
import { Button, Mono, Select } from "./ui";
import { cx, shortHash } from "../lib/utils";

interface GitWorkflowModalProps {
  isOpen: boolean;
  projectId?: string | null;
  onClose: () => void;
}

export function GitWorkflowModal({
  isOpen,
  projectId: propProjectId,
  onClose,
}: GitWorkflowModalProps) {
  const projects = useProjectsStore((s) => s.projects);
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const refreshSnapshot = useProjectsStore((s) => s.refreshSnapshot);
  const toast = useUiStore((s) => s.toast);

  const initialProjectId =
    propProjectId ??
    activeProjectId ??
    (projects.length > 0 ? projects[0].id : "");

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);
  const [status, setStatus] = useState<GitWorkflowStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [busyAction, setBusyAction] = useState<"stage" | "commit" | "push" | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; type: "ok" | "err" } | null>(null);
  const [pushBranch, setPushBranch] = useState("");
  const [pushRemote, setPushRemote] = useState("origin");
  const [setUpstream, setSetUpstream] = useState(false);

  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Sync selected project ID when opened
  useEffect(() => {
    if (isOpen) {
      const pid =
        propProjectId ??
        activeProjectId ??
        (projects.length > 0 ? projects[0].id : "");
      setSelectedProjectId(pid);
      setFeedback(null);
    }
  }, [isOpen, propProjectId, activeProjectId, projects]);

  const loadStatus = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    try {
      const data = await ipc.gitGetWorkflowStatus(pid);
      setStatus(data);
      setPushBranch(data.branch ?? "main");
      setPushRemote(data.remoteName ?? "origin");
      setSetUpstream(!data.upstream);
      // Select unstaged files by default
      const unstaged = new Set(data.files.filter((f) => !f.staged).map((f) => f.path));
      setSelectedFiles(unstaged);
    } catch (err) {
      console.error("failed to get workflow status", err);
      setStatus(null);
      setFeedback({ message: String(err), type: "err" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && selectedProjectId) {
      void loadStatus(selectedProjectId);
    }
  }, [isOpen, selectedProjectId, loadStatus]);

  // Keyboard navigation: Escape closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyAction) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, busyAction, onClose]);

  if (!isOpen) return null;

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  const stagedFiles = status?.files.filter((f) => f.staged) ?? [];
  const unstagedFiles = status?.files.filter((f) => !f.staged) ?? [];
  const hasStaged = stagedFiles.length > 0;
  const hasUnstaged = unstagedFiles.length > 0;
  const isClean = stagedFiles.length === 0 && unstagedFiles.length === 0;

  // Toggle selection for individual file
  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Select all unstaged
  const selectAllUnstaged = () => {
    setSelectedFiles(new Set(unstagedFiles.map((f) => f.path)));
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  // Stage selected or all
  const handleStageAll = async () => {
    if (!selectedProjectId || busyAction) return;
    setBusyAction("stage");
    setFeedback(null);
    try {
      const res = await ipc.gitStageAll(selectedProjectId);
      if (res.success) {
        setFeedback({ message: "All changes staged.", type: "ok" });
        await loadStatus(selectedProjectId);
        await refreshSnapshot(selectedProjectId);
        messageInputRef.current?.focus();
      } else {
        setFeedback({ message: res.error || res.output || "Staging failed", type: "err" });
      }
    } catch (err) {
      setFeedback({ message: String(err), type: "err" });
    } finally {
      setBusyAction(null);
    }
  };

  const handleStageSelected = async () => {
    if (!selectedProjectId || busyAction || selectedFiles.size === 0) return;
    setBusyAction("stage");
    setFeedback(null);
    try {
      const files = Array.from(selectedFiles);
      const res = await ipc.gitStageFiles(selectedProjectId, files);
      if (res.success) {
        setFeedback({ message: `Staged ${files.length} file(s).`, type: "ok" });
        await loadStatus(selectedProjectId);
        await refreshSnapshot(selectedProjectId);
        messageInputRef.current?.focus();
      } else {
        setFeedback({ message: res.error || res.output || "Staging failed", type: "err" });
      }
    } catch (err) {
      setFeedback({ message: String(err), type: "err" });
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnstageAll = async () => {
    if (!selectedProjectId || busyAction || stagedFiles.length === 0) return;
    setBusyAction("stage");
    setFeedback(null);
    try {
      const files = stagedFiles.map((f) => f.path);
      const res = await ipc.gitUnstageFiles(selectedProjectId, files);
      if (res.success) {
        setFeedback({ message: "Unstaged all changes.", type: "ok" });
        await loadStatus(selectedProjectId);
        await refreshSnapshot(selectedProjectId);
      } else {
        setFeedback({ message: res.error || res.output || "Unstage failed", type: "err" });
      }
    } catch (err) {
      setFeedback({ message: String(err), type: "err" });
    } finally {
      setBusyAction(null);
    }
  };

  // Commit
  const handleCommit = async () => {
    if (!selectedProjectId || busyAction) return;
    const msg = commitMessage.trim();
    if (!msg) {
      setFeedback({ message: "Please enter a commit message.", type: "err" });
      messageInputRef.current?.focus();
      return;
    }
    if (!hasStaged) {
      setFeedback({
        message: "No staged changes to commit. Stage your changes first.",
        type: "err",
      });
      return;
    }

    setBusyAction("commit");
    setFeedback(null);
    try {
      const res = await ipc.gitCommitChanges(selectedProjectId, msg);
      if (res.success) {
        setCommitMessage("");
        setFeedback({
          message: `Commit created: "${msg}"`,
          type: "ok",
        });
        toast("Commit created", { detail: msg, variant: "success" });
        await loadStatus(selectedProjectId);
        await refreshSnapshot(selectedProjectId);
      } else {
        setFeedback({
          message: res.error || res.output || "Commit failed",
          type: "err",
        });
      }
    } catch (err) {
      setFeedback({ message: String(err), type: "err" });
    } finally {
      setBusyAction(null);
    }
  };

  // Push
  const handlePush = async () => {
    if (!selectedProjectId || busyAction) return;
    const branch = pushBranch.trim() || status?.branch;
    if (!branch) {
      setFeedback({ message: "Target branch cannot be determined.", type: "err" });
      return;
    }

    setBusyAction("push");
    setFeedback(null);
    try {
      const res = await ipc.gitPushWorkflow(
        selectedProjectId,
        pushRemote.trim() || "origin",
        branch,
        setUpstream
      );
      if (res.success) {
        setFeedback({
          message: `Push completed to ${pushRemote}/${branch}.`,
          type: "ok",
        });
        toast("Push completed", {
          detail: `Pushed to ${pushRemote}/${branch}`,
          variant: "success",
        });
        await loadStatus(selectedProjectId);
        await refreshSnapshot(selectedProjectId);
      } else {
        setFeedback({
          message: res.error || res.output || "Push failed or rejected",
          type: "err",
        });
      }
    } catch (err) {
      setFeedback({ message: String(err), type: "err" });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fade-in flex max-h-[90vh] w-[640px] flex-col rounded-xl border border-border bg-[#0f0f11] text-text shadow-2xl shadow-black/80 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="git-workflow-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-surface">
          <div className="flex items-center gap-2.5 min-w-0">
            <GitPullRequest className="h-4 w-4 text-text shrink-0" />
            <div>
              <h2 id="git-workflow-title" className="text-sm font-semibold text-text leading-tight">
                Git Workflow
              </h2>
              <div className="text-[11px] text-muted">Add · Commit · Push</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {projects.length > 1 ? (
              <Select
                value={selectedProjectId}
                onChange={(val) => setSelectedProjectId(val)}
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            ) : (
              <span className="font-mono text-xs font-semibold text-secondary">
                {currentProject?.name}
              </span>
            )}

            <button
              onClick={() => loadStatus(selectedProjectId)}
              disabled={loading || busyAction !== null}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-2 text-secondary hover:text-text hover:bg-surface-3 transition-colors disabled:opacity-40"
              title="Refresh Git Status"
            >
              <RefreshCw className={cx("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>

            <button
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-text hover:bg-surface-2 transition-colors"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 divide-y divide-border/60">
          {/* Top Info Strip */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-md border border-border bg-surface p-2.5 space-y-1">
              <div className="label-overline">Repository</div>
              <div className="font-semibold text-text truncate" title={currentProject?.path}>
                {status?.projectName ?? currentProject?.name ?? "—"}
              </div>
              <Mono className="text-[10px] text-muted truncate block">
                {status?.path ?? currentProject?.path ?? ""}
              </Mono>
            </div>

            <div className="rounded-md border border-border bg-surface p-2.5 space-y-1">
              <div className="label-overline">Current Branch</div>
              <div className="flex items-center gap-1.5 font-mono font-medium text-text">
                <GitBranch className="h-3.5 w-3.5 text-muted shrink-0" />
                <span className="truncate">{status?.branch ?? (status?.detached ? "detached HEAD" : "—")}</span>
              </div>
              <div className="text-[10.5px] font-mono text-muted truncate">
                {status?.upstream ? `tracks ${status.upstream}` : "no upstream set"}
              </div>
            </div>

            <div className="rounded-md border border-border bg-surface p-2.5 space-y-1">
              <div className="label-overline">Sync State</div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className={cx(status && status.ahead > 0 ? "text-success font-medium" : "text-muted")}>
                  ↑ {status?.ahead ?? 0} ahead
                </span>
                <span className="text-border">·</span>
                <span className={cx(status && status.behind > 0 ? "text-warning font-medium" : "text-muted")}>
                  ↓ {status?.behind ?? 0} behind
                </span>
              </div>
              <div className="text-[10.5px] font-mono text-muted">
                {stagedFiles.length} staged · {unstagedFiles.length} unstaged
              </div>
            </div>
          </div>

          {/* Feedback Banner */}
          {feedback && (
            <div
              className={cx(
                "rounded-md border p-3 text-xs leading-relaxed transition-all",
                feedback.type === "ok"
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-error/30 bg-error/10 text-error font-mono text-[11.5px] whitespace-pre-wrap select-text"
              )}
            >
              <div className="flex items-start gap-2">
                {feedback.type === "ok" ? (
                  <Check className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <X className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">{feedback.message}</div>
              </div>
            </div>
          )}

          {/* STEP 1: Git Add / Stage */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 font-mono text-[11px] font-semibold text-text">
                    1
                  </span>
                  <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
                    Stage Changes (Git Add)
                  </h3>
                </div>
                <div className="text-[11px] text-muted ml-7">
                  Select files to stage into the index for commit
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasUnstaged && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleStageAll}
                    disabled={busyAction !== null}
                  >
                    Stage All ({unstagedFiles.length})
                  </Button>
                )}
                {hasStaged && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleUnstageAll}
                    disabled={busyAction !== null}
                  >
                    Unstage All ({stagedFiles.length})
                  </Button>
                )}
              </div>
            </div>

            {/* File List */}
            <div className="ml-7 rounded-md border border-border bg-[#0a0a0b] overflow-hidden">
              {isClean ? (
                <div className="p-4 text-center text-xs text-muted">
                  Working tree is clean. No unstaged or staged changes.
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto divide-y divide-border/40 font-mono text-xs">
                  {status?.files.map((file, idx) => {
                    const isSelected = selectedFiles.has(file.path);
                    return (
                      <div
                        key={`${file.path}-${idx}`}
                        onClick={() => !file.staged && toggleFile(file.path)}
                        className={cx(
                          "flex items-center justify-between px-3 py-1.5 transition-colors select-none",
                          !file.staged ? "cursor-pointer hover:bg-surface-2" : "bg-surface/50"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {!file.staged ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFile(file.path);
                              }}
                              className="text-secondary hover:text-text"
                            >
                              {isSelected ? (
                                <CheckSquare className="h-3.5 w-3.5 text-text" />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-muted" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-success">
                              ✓
                            </span>
                          )}
                          <span
                            className={cx(
                              "truncate text-[11.5px]",
                              file.staged ? "text-text font-medium" : "text-secondary"
                            )}
                            title={file.path}
                          >
                            {file.path}
                          </span>
                        </div>

                        <span
                          className={cx(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                            file.staged
                              ? "bg-success/15 text-success border border-success/25"
                              : file.status === "??"
                              ? "bg-surface-2 text-muted border border-border"
                              : "bg-warning/15 text-warning border border-warning/25"
                          )}
                        >
                          {file.statusLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {hasUnstaged && selectedFiles.size > 0 && (
              <div className="ml-7 flex items-center justify-between text-xs">
                <div className="text-secondary">
                  {selectedFiles.size} of {unstagedFiles.length} file(s) selected
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={selectedFiles.size === unstagedFiles.length ? deselectAll : selectAllUnstaged}
                  >
                    {selectedFiles.size === unstagedFiles.length ? "Deselect All" : "Select All Unstaged"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleStageSelected}
                    disabled={busyAction !== null}
                  >
                    Stage Selected ({selectedFiles.size})
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Git Commit */}
          <div className="pt-4 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 font-mono text-[11px] font-semibold text-text">
                  2
                </span>
                <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
                  Commit Staged Changes
                </h3>
              </div>
              <div className="text-[11px] text-muted ml-7">
                Enter a concise message summarizing staged modifications
              </div>
            </div>

            <div className="ml-7 space-y-2.5">
              <div className="relative">
                <textarea
                  ref={messageInputRef}
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                      e.preventDefault();
                      void handleCommit();
                    }
                  }}
                  rows={2}
                  placeholder={hasStaged ? "Describe the changes..." : "Stage changes above to enable commit..."}
                  disabled={!hasStaged || busyAction !== null}
                  className="w-full resize-none rounded-md border border-border bg-[#0a0a0b] px-3 py-2 text-xs font-mono text-text placeholder:text-muted focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-40"
                />
                <div className="flex justify-between items-center text-[10.5px] text-muted px-1 mt-1 font-mono">
                  <span>Ctrl+Enter to commit</span>
                  <span>{commitMessage.length} chars</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-secondary font-mono">
                  Staged files: <span className={hasStaged ? "text-success font-semibold" : "text-muted"}>{stagedFiles.length}</span>
                </div>

                <Button
                  variant="primary"
                  onClick={handleCommit}
                  disabled={!hasStaged || !commitMessage.trim() || busyAction !== null}
                >
                  {busyAction === "commit" ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Committing…
                    </>
                  ) : (
                    <>
                      <GitCommit className="h-3.5 w-3.5" /> Commit ({stagedFiles.length} staged)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* STEP 3: Git Push */}
          <div className="pt-4 space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 font-mono text-[11px] font-semibold text-text">
                  3
                </span>
                <h3 className="text-xs font-semibold text-text uppercase tracking-wider">
                  Push to Remote
                </h3>
              </div>
              <div className="text-[11px] text-muted ml-7">
                Publish local commits to tracking remote branch
              </div>
            </div>

            <div className="ml-7 rounded-md border border-border bg-surface p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <label className="text-[10.5px] uppercase tracking-wider text-muted block mb-1">
                    Remote
                  </label>
                  <input
                    type="text"
                    value={pushRemote}
                    onChange={(e) => setPushRemote(e.target.value)}
                    disabled={busyAction !== null}
                    placeholder="origin"
                    className="w-full rounded border border-border bg-[#0a0a0b] px-2.5 py-1.5 text-xs text-text focus:border-border-strong focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10.5px] uppercase tracking-wider text-muted block mb-1">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={pushBranch}
                    onChange={(e) => setPushBranch(e.target.value)}
                    disabled={busyAction !== null}
                    placeholder="main"
                    className="w-full rounded border border-border bg-[#0a0a0b] px-2.5 py-1.5 text-xs text-text focus:border-border-strong focus:outline-none"
                  />
                </div>
              </div>

              {!status?.upstream && (
                <div className="flex items-center gap-2 text-[11.5px] text-warning bg-warning/10 border border-warning/20 rounded p-2">
                  <input
                    type="checkbox"
                    id="set-upstream"
                    checked={setUpstream}
                    onChange={(e) => setSetUpstream(e.target.checked)}
                    className="rounded border-border"
                  />
                  <label htmlFor="set-upstream" className="cursor-pointer select-none">
                    Set upstream tracking to <span className="font-mono">{pushRemote}/{pushBranch}</span> (-u)
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                <div className="text-secondary font-mono text-[11px]">
                  Target: <span className="text-text font-medium">{pushRemote}/{pushBranch}</span>
                  {status && status.ahead > 0 && (
                    <span className="text-success ml-2">({status.ahead} commit{status.ahead === 1 ? "" : "s"} ahead)</span>
                  )}
                </div>

                <Button
                  variant="primary"
                  onClick={handlePush}
                  disabled={busyAction !== null || !pushBranch.trim() || !pushRemote.trim()}
                >
                  {busyAction === "push" ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Pushing…
                    </>
                  ) : (
                    <>
                      <ArrowUp className="h-3.5 w-3.5" /> Push to {pushRemote}/{pushBranch}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-surface px-5 py-3 text-xs">
          <div className="text-muted font-mono text-[11px]">
            {status?.latestCommit && (
              <span>
                Latest: <Mono className="text-secondary">{shortHash(status.latestCommit.hash)}</Mono> {status.latestCommit.subject}
              </span>
            )}
          </div>

          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
