import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Download,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Loader2,
  Plus,
  Terminal,
  X,
} from "lucide-react";
import { ipc } from "../lib/ipc";
import { clampRectToWork, nearestMonitor, tweenWindow } from "../lib/geometry";
import { useDockStore } from "../stores/dockStore";
import { useEventsStore } from "../stores/eventsStore";
import { useProjectsStore } from "../stores/projectsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { cx, relativeTime, shortHash } from "../lib/utils";
import type {
  DevPilotEvent,
  DockEdge,
  IslandMode,
  PhysRect,
  Project,
  RepoSnapshot,
} from "../types";
import { statusSummary } from "../components/ProjectRow";
import { Mono, StatusDot } from "../components/ui";
import { Logo } from "../components/Logo";
import { EdgeRoot } from "./EdgeRoot";

interface DragRef {
  active: boolean;
  started: boolean;
  pointerId: number;
  grabPhys: { x: number; y: number };
  lastTarget: { x: number; y: number };
  rafPending: boolean;
  lastClick: number;
}

const win = getCurrentWindow();

export function IslandApp() {
  const settings = useSettingsStore((s) => s.settings);
  const projects = useProjectsStore((s) => s.projects);
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsStore((s) => s.setActiveProject);
  const addProject = useProjectsStore((s) => s.add);
  const snapshots = useProjectsStore((s) => s.snapshots);
  const refreshSnapshot = useProjectsStore((s) => s.refreshSnapshot);
  const loadProjects = useProjectsStore((s) => s.load);
  const events = useEventsStore((s) => s.events);
  const dock = useDockStore((s) => s.dock);
  const setDock = useDockStore((s) => s.setDock);

  // Three-state island: idle logo circle → hover peek → full panel.
  const [mode, setMode] = useState<IslandMode>("icon");
  const [animating, setAnimating] = useState(false);
  const [banner, setBanner] = useState<DevPilotEvent | null>(null);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fetchResult, setFetchResult] = useState<"ok" | "err" | null>(null);
  // While a drag is in flight the island is detached from the edge, so the
  // decorative edge root is hidden until it snaps back into place.
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<DragRef>({
    active: false,
    started: false,
    pointerId: -1,
    grabPhys: { x: 0, y: 0 },
    lastTarget: { x: 0, y: 0 },
    rafPending: false,
    lastClick: 0,
  });
  const hideTimer = useRef<number | null>(null);
  const peekTimer = useRef<number | null>(null);
  const modeRef = useRef<IslandMode>("icon");
  const dockSyncingRef = useRef(false);

  // Clean up close target on unmount
  useEffect(() => {
    return () => {
      void ipc.hideCloseTarget();
    };
  }, []);

  // Initial load
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Active project & snapshot
  const activeProject =
    projects.find((p) => p.id === activeProjectId) ??
    (projects.length > 0 ? projects[0] : null);

  const snap = activeProject ? snapshots[activeProject.id] : undefined;

  // Poll active project snapshot periodically if missing
  useEffect(() => {
    if (activeProject && !snap) {
      refreshSnapshot(activeProject.id);
    }
  }, [activeProject, snap, refreshSnapshot]);

  // The dock edge can change from Settings as well as from dragging. Either way
  // the island returns to its idle icon; the Rust side has already resized the
  // window to match the new edge.
  useEffect(() => {
    modeRef.current = "icon";
    setMode("icon");
  }, [dock.edge, settings.islandSize]);

  // Dock position is changed from the Settings page (a separate window). When the
  // persisted edge diverges from this window's view, re-read the dock state so
  // the island switches between horizontal and vertical immediately. Guarded so
  // a failed re-dock cannot turn this into a tight IPC loop.
  useEffect(() => {
    if (settings.dockPosition === dock.edge || dockSyncingRef.current) return;
    dockSyncingRef.current = true;
    void useDockStore
      .getState()
      .load()
      .finally(() => {
        dockSyncingRef.current = false;
      });
  }, [settings.dockPosition, dock.edge]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

  // ---- mode transitions ----------------------------------------------------
  const applyMode = useCallback(
    async (next: IslandMode, animate = true) => {
      const prev = modeRef.current;
      if (next === prev) return;
      modeRef.current = next;
      // Only panel transitions fade their content; icon <-> peek must feel instant.
      const heavy = next === "expanded" || prev === "expanded";
      if (heavy) setAnimating(true);
      try {
        const target = next === "peek" ? await ipc.islandPeekRect() : await ipc.islandTargetRect(next);
        const from = await currentRect();
        if (animate && settings.animation) {
          await tweenWindow(win, from, target, next === "expanded" ? 180 : 150);
        } else {
          await win.setPosition(new PhysicalPosition(target.x, target.y));
          await win.setSize(new PhysicalSize(target.width, target.height));
        }
        setMode(next);
        await ipc.finalizeDock(next);
      } catch (err) {
        console.error("island transition failed", err);
      } finally {
        if (heavy) setAnimating(false);
      }
    },
    [settings.animation]
  );

  const expand = useCallback(() => applyMode("expanded"), [applyMode]);
  const collapse = useCallback(() => applyMode("icon"), [applyMode]);
  const peek = useCallback(() => applyMode("peek"), [applyMode]);

  const bannerTimerRef = useRef<number | null>(null);

  const handleDismissBanner = useCallback(() => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    setBanner(null);
    if (modeRef.current === "peek") void collapse();
  }, [collapse]);

  // Listen for live events emitted from the backend (build failures, pushes, etc.)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<DevPilotEvent>("devpilot:event", (e) => {
        const next = e.payload;
        const isNotif =
          next.severity === "critical" ||
          next.severity === "high" ||
          next.severity === "medium" ||
          next.type === "PUSH_COMPLETED" ||
          next.type === "REMOTE_COMMIT" ||
          next.type === "BUILD_SUCCESS" ||
          next.type === "BUILD_FAILED";

        if (isNotif) {
          if (bannerTimerRef.current) {
            clearTimeout(bannerTimerRef.current);
            bannerTimerRef.current = null;
          }
          setBanner(next);
          if (modeRef.current === "icon") void peek();

          const ttl = next.severity === "critical" ? 15000 : 7000;
          bannerTimerRef.current = window.setTimeout(() => {
            setBanner(null);
            if (modeRef.current === "peek") void collapse();
          }, ttl);
        }
      });
    })();

    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      if (unlisten) unlisten();
    };
  }, [peek, collapse]);

  // ---- auto-hide + hover ---------------------------------------------------
  const scheduleHide = useCallback(() => {
    if (settings.autoHideDelay <= 0) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (modeRef.current === "expanded" && !dragRef.current.active) void collapse();
    }, settings.autoHideDelay * 1000);
  }, [settings.autoHideDelay, collapse]);

  const handlePillEnter = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (peekTimer.current) {
      clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
    if (modeRef.current === "icon") void peek();
  };

  const handlePillLeave = () => {
    scheduleHide();
    if (modeRef.current !== "peek") return;
    // Small grace period so a cursor at the boundary cannot cause flicker.
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => {
      if (modeRef.current === "peek" && !dragRef.current.active) void collapse();
    }, 200);
  };

  const closeHoverRef = useRef(false);

  // ---- drag -----------------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Do not initiate drag or pointer capture on interactive elements
    if ((e.target as HTMLElement).closest("button, select, input, a, [role='button']")) {
      return;
    }
    const d = dragRef.current;
    d.active = true;
    d.started = false;
    d.pointerId = e.pointerId;
    d.grabPhys = { x: 0, y: 0 };
    closeHoverRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;

    const dpr = window.devicePixelRatio || 1;
    const sx = e.screenX * dpr;
    const sy = e.screenY * dpr;

    if (!d.started) {
      const pos = await win.outerPosition();
      d.grabPhys = { x: sx - pos.x, y: sy - pos.y };
      d.started = true;
      setDragging(true);
      await useDockStore.getState().refreshMonitors();
      // Drag the compact icon, never a half-open panel.
      if (modeRef.current !== "icon") {
        await collapseInstant();
      }
      const layout = useDockStore.getState().monitors;
      if (layout.length > 0) {
        const mon = nearestMonitor(layout, sx, sy);
        const targetPhysX = Math.round(mon.work.x + mon.work.width / 2);
        const targetPhysY = Math.round(mon.work.y + mon.work.height - 72);
        closeHoverRef.current = false;
        void ipc.showCloseTarget(targetPhysX, targetPhysY, false);
      }
      return;
    }

    d.lastTarget = { x: sx - d.grabPhys.x, y: sy - d.grabPhys.y };
    if (d.rafPending) return;
    d.rafPending = true;
    requestAnimationFrame(async () => {
      d.rafPending = false;
      const layout = useDockStore.getState().monitors;
      if (layout.length === 0) return;
      const size = await win.outerSize();
      const rect: PhysRect = {
        x: d.lastTarget.x,
        y: d.lastTarget.y,
        width: size.width,
        height: size.height,
      };
      const mon = nearestMonitor(layout, rect.x + rect.width / 2, rect.y + rect.height / 2);
      const clamped = clampRectToWork(rect, mon.work);
      await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));

      // Measure distance between Island center and monitor's center-bottom close target
      const cx = clamped.x + clamped.width / 2;
      const cy = clamped.y + clamped.height / 2;
      const targetPhysX = Math.round(mon.work.x + mon.work.width / 2);
      const targetPhysY = Math.round(mon.work.y + mon.work.height - 72);
      const dist = Math.hypot(cx - targetPhysX, cy - targetPhysY);
      const isNear = dist <= 84;

      if (isNear !== closeHoverRef.current) {
        closeHoverRef.current = isNear;
        void ipc.showCloseTarget(targetPhysX, targetPhysY, isNear);
      }
    });
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.active || d.pointerId !== e.pointerId) return;
    d.active = false;
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (d.started) {
      const dpr = window.devicePixelRatio || 1;
      const sx = e.screenX * dpr;
      const sy = e.screenY * dpr;
      const target = { x: sx - d.grabPhys.x, y: sy - d.grabPhys.y };

      const layout = useDockStore.getState().monitors;
      const size = await win.outerSize();
      const cx = target.x + size.width / 2;
      const cy = target.y + size.height / 2;
      const mon = nearestMonitor(layout, cx, cy);
      const targetPhysX = Math.round(mon.work.x + mon.work.width / 2);
      const targetPhysY = Math.round(mon.work.y + mon.work.height - 72);
      const dist = Math.hypot(cx - targetPhysX, cy - targetPhysY);

      void ipc.hideCloseTarget();

      if (dist <= 84) {
        // Released over center-bottom close target: fully close and exit Dev Pilot
        closeHoverRef.current = false;
        setDragging(false);
        void ipc.hideCloseTarget();
        await ipc.quitApp();
        return;
      }

      try {
        const result = await ipc.snapDock(target.x, target.y);
        const from = await currentRect();
        if (settings.animation) {
          await tweenWindow(win, from, result.rect, 190);
        } else {
          await win.setPosition(new PhysicalPosition(result.rect.x, result.rect.y));
          await win.setSize(new PhysicalSize(result.rect.width, result.rect.height));
        }
        await ipc.finalizeDock("icon");
        setDock(result.state);
        modeRef.current = "icon";
        setMode("icon");
        // Settings mirror the dock edge chosen by dragging — one source of truth.
        void useSettingsStore.getState().mirrorDock(result.state.edge);
      } catch (err) {
        console.error("snap failed", err);
      }
      setDragging(false);
      return;
    }

    // Interactive button click check
    if ((e.target as HTMLElement).closest("button, select, input, a, [role='button']")) {
      return;
    }

    // Single click toggles expansion; double click opens Command Center
    const now = Date.now();
    const isDouble = now - d.lastClick < 320;
    d.lastClick = now;
    if (isDouble) {
      await ipc.openCommandCenter();
      return;
    }
    if (modeRef.current === "expanded") {
      void collapse();
    } else {
      void expand();
    }
  };

  const onPointerCancel = () => {
    const d = dragRef.current;
    if (d.active) {
      d.active = false;
      closeHoverRef.current = false;
      setDragging(false);
      void ipc.hideCloseTarget();
    }
  };

  const collapseInstant = async () => {
    const target = await ipc.islandTargetRect("icon");
    await win.setPosition(new PhysicalPosition(target.x, target.y));
    await win.setSize(new PhysicalSize(target.width, target.height));
    modeRef.current = "icon";
    setMode("icon");
    await ipc.finalizeDock("icon");
  };

  // ---- real actions --------------------------------------------------------
  const handleFetch = async () => {
    if (!activeProject || fetchBusy) return;
    setFetchBusy(true);
    setFetchResult(null);
    try {
      await ipc.gitFetch(activeProject.id);
      setTimeout(async () => {
        await refreshSnapshot(activeProject.id);
        setFetchBusy(false);
        setFetchResult("ok");
        setTimeout(() => setFetchResult(null), 3000);
      }, 1500);
    } catch (err) {
      console.error("fetch failed", err);
      setFetchBusy(false);
      setFetchResult("err");
      setTimeout(() => setFetchResult(null), 4000);
    }
  };

  const handleOpenFolder = () => {
    if (activeProject) {
      ipc.openInExplorer(activeProject.path);
    }
  };

  const handleOpenTerminal = () => {
    if (activeProject) {
      ipc.openTerminal(activeProject.path);
    }
  };

  const handleOpenCommandCenter = async () => {
    await ipc.openCommandCenter();
  };

  const handleOpenGitWorkflow = async () => {
    if (activeProject) {
      await ipc.openGitWorkflow(activeProject.id);
    } else {
      await ipc.openGitWorkflow();
    }
  };

  const handleAddProject = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || Array.isArray(selected)) return;
      const isGit = await ipc.checkIsGit(selected);
      if (!isGit) {
        await ipc.openCommandCenter();
        return;
      }
      const defaultName = selected.split(/[\\/]/).filter(Boolean).pop() ?? "Project";
      const project = await addProject(defaultName, selected);
      await setActiveProject(project.id);
      await refreshSnapshot(project.id);
    } catch (err) {
      console.error("failed to add project", err);
      await ipc.openCommandCenter();
    }
  };

  const edge = dock.edge;
  const isVertical = edge === "left" || edge === "right";
  const status = statusSummary(snap);
  const recentEvents = (
    activeProject
      ? events.filter((e) => !e.projectId || e.projectId === activeProject.id)
      : events
  ).slice(0, 3);

  // Idle keeps it to just the logo, but the ring still signals health.
  const pillTone =
    banner?.severity === "critical"
      ? "err"
      : banner?.severity === "high"
      ? "warn"
      : mode === "icon" && projects.length > 0
      ? status.tone
      : null;
  const iconLogoSize = settings.islandSize === "small" ? 30 : settings.islandSize === "large" ? 38 : 34;

  return (
    <div className="island-window h-full w-full">
      <div
        className={cx(
          "island-pill",
          isVertical && "is-vertical",
          mode === "expanded" && "is-expanded",
          pillTone === "err" && "is-error",
          pillTone === "warn" && "is-warning"
        )}
        data-edge={edge}
        data-mode={mode}
        data-vertical={isVertical ? "true" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseEnter={handlePillEnter}
        onMouseLeave={handlePillLeave}
        style={{ cursor: dragRef.current.active ? "grabbing" : "default" }}
      >
        <div className={cx("island-content", animating && "is-animating")}>
          {banner ? (
            <EventBanner
              event={banner}
              onDismiss={handleDismissBanner}
              isVertical={isVertical}
            />
          ) : mode === "expanded" ? (
            isVertical ? (
              <VerticalExpandedPanel
                edge={edge}
                project={activeProject}
                projects={projects}
                snapshot={snap}
                recentEvents={recentEvents}
                fetchBusy={fetchBusy}
                fetchResult={fetchResult}
                onSelectProject={(id) => setActiveProject(id)}
                onFetch={handleFetch}
                onOpenFolder={handleOpenFolder}
                onOpenTerminal={handleOpenTerminal}
                onOpenGitWorkflow={handleOpenGitWorkflow}
                onOpenCenter={handleOpenCommandCenter}
                onAddProject={handleAddProject}
                onCollapse={collapse}
              />
            ) : (
              <HorizontalExpandedPanel
                edge={edge}
                project={activeProject}
                projects={projects}
                snapshot={snap}
                fetchBusy={fetchBusy}
                fetchResult={fetchResult}
                onSelectProject={(id) => setActiveProject(id)}
                onFetch={handleFetch}
                onOpenFolder={handleOpenFolder}
                onOpenTerminal={handleOpenTerminal}
                onOpenGitWorkflow={handleOpenGitWorkflow}
                onOpenCenter={handleOpenCommandCenter}
                onAddProject={handleAddProject}
                onCollapse={collapse}
              />
            )
          ) : mode === "peek" ? (
            isVertical ? (
              <VerticalPeekPill
                project={activeProject}
                snapshot={snap}
                statusText={status.text}
                statusTone={status.tone}
                onAddProject={handleAddProject}
              />
            ) : (
              <HorizontalPeekPill
                hasProjects={projects.length > 0}
                project={activeProject}
                snapshot={snap}
                statusText={status.text}
                statusTone={status.tone}
                onAddProject={handleAddProject}
              />
            )
          ) : (
            // Idle: the logo alone. Click to open, drag to dock — no controls
            // here so the whole circle stays a drag handle.
            <div className="flex h-full w-full items-center justify-center">
              <Logo size={iconLogoSize} className="rounded-full object-cover" />
            </div>
          )}
        </div>
      </div>
      {!dragging && <EdgeRoot edge={edge} round={mode === "icon"} tone={pillTone} />}
    </div>
  );
}

// ---- Horizontal Compact Pill (Top / Bottom) --------------------------------

// ---- Hover Peek (Top / Bottom) ---------------------------------------------
// A small, dense strip revealed on hover: logo, project, branch, status.

function statusBadgeClass(tone: "ok" | "warn" | "err" | "idle") {
  return cx(
    "shrink-0 rounded-full border px-2 py-px font-mono text-[10px]",
    tone === "err" && "border-error/30 text-error",
    tone === "warn" && "border-warning/30 text-warning",
    tone === "ok" && "border-border text-muted",
    tone === "idle" && "border-border text-muted"
  );
}

function HorizontalPeekPill({
  hasProjects,
  project,
  snapshot,
  statusText,
  statusTone,
  onAddProject,
}: {
  hasProjects: boolean;
  project: Project | null;
  snapshot?: RepoSnapshot;
  statusText: string;
  statusTone: "ok" | "warn" | "err" | "idle";
  onAddProject: () => void;
}) {
  return (
    <div className="flex h-full items-center gap-2 px-2.5">
      <Logo size={22} className="rounded-full" fit="cover" />
      <div className="min-w-0 flex-1 leading-tight">
        {project && (
          <div className="truncate text-[11.5px] font-semibold text-text">
            {project.name}
          </div>
        )}
        {project && snapshot?.ok && (
          <div className="flex items-center gap-1.5 truncate font-mono text-[10px] text-secondary">
            {snapshot.branch && <span className="truncate">{snapshot.branch}</span>}
            {snapshot.behind > 0 && (
              <span className="shrink-0 text-warning font-semibold">↓{snapshot.behind}</span>
            )}
            {snapshot.ahead > 0 && (
              <span className="shrink-0 text-success">↑{snapshot.ahead}</span>
            )}
          </div>
        )}
      </div>
      {hasProjects ? (
        <span className={statusBadgeClass(statusTone)}>{statusText}</span>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddProject();
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-px font-mono text-[10px] text-secondary hover:border-border-strong hover:text-text"
        >
          <Plus className="h-2.5 w-2.5" /> Add Project
        </button>
      )}
    </div>
  );
}

// ---- Hover Peek (Left / Right) ---------------------------------------------
// Narrow vertical strip — logo on top, then project, branch and a compact
// status. Text wraps rather than clipping.

function VerticalPeekPill({
  project,
  snapshot,
  statusTone,
  onAddProject,
}: {
  project: Project | null;
  snapshot?: RepoSnapshot;
  statusText: string;
  statusTone: "ok" | "warn" | "err" | "idle";
  onAddProject: () => void;
}) {
  const totalMod = snapshot?.ok
    ? snapshot.modifiedCount + snapshot.stagedCount + snapshot.untrackedCount
    : 0;
  const shortStatus = !snapshot
    ? "—"
    : !snapshot.ok
    ? "unavailable"
    : snapshot.conflictCount > 0
    ? `${snapshot.conflictCount} conflicts`
    : totalMod > 0
    ? `${totalMod} changed`
    : snapshot.behind > 0
    ? `${snapshot.behind} behind`
    : snapshot.ahead > 0
    ? `${snapshot.ahead} ahead`
    : "clean";

  return (
    <div className="flex h-full w-full select-none flex-col items-center justify-center gap-1.5 px-1.5 py-2 text-center">
      <Logo size={24} className="rounded-full" fit="cover" />
      {project ? (
        <>
          <span className="w-full break-words text-[10.5px] font-semibold leading-tight text-text">
            {project.name}
          </span>
          {snapshot?.ok && (
            <div className="flex items-center justify-center gap-1 font-mono text-[9.5px] leading-tight text-secondary">
              {snapshot.branch && <span className="truncate max-w-[48px]">{snapshot.branch}</span>}
              {snapshot.behind > 0 && <span className="text-warning font-semibold">↓{snapshot.behind}</span>}
              {snapshot.ahead > 0 && <span className="text-success">↑{snapshot.ahead}</span>}
            </div>
          )}
          <span
            className={cx(
              "w-full break-words text-[9.5px] font-medium leading-tight",
              !snapshot || !snapshot.ok || snapshot.conflictCount > 0
                ? "text-error"
                : totalMod > 0 || (snapshot.behind > 0)
                ? "text-warning"
                : "text-muted"
            )}
          >
            {shortStatus}
          </span>
        </>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAddProject();
          }}
          className="flex w-full flex-col items-center gap-1 text-text hover:text-white"
          title="Add Project"
        >
          <span className="text-[10.5px] font-semibold leading-tight">
            + Add
            <br />
            Project
          </span>
        </button>
      )}
    </div>
  );
}

// ---- Horizontal Expanded Panel (Top / Bottom) ------------------------------

function HorizontalExpandedPanel({
  edge,
  project,
  projects,
  snapshot,
  fetchBusy,
  fetchResult,
  onSelectProject,
  onFetch,
  onOpenFolder,
  onOpenTerminal,
  onOpenGitWorkflow,
  onOpenCenter,
  onAddProject,
  onCollapse,
}: {
  edge: DockEdge;
  project: Project | null;
  projects: Project[];
  snapshot?: RepoSnapshot;
  fetchBusy: boolean;
  fetchResult: "ok" | "err" | null;
  onSelectProject: (id: string) => void;
  onFetch: () => void;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
  onOpenGitWorkflow: () => void;
  onOpenCenter: () => void;
  onAddProject: () => void;
  onCollapse: () => void;
}) {
  if (!project) {
    return (
      <div className="flex h-full flex-col p-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <div className="text-xs font-semibold text-text">DEV PILOT</div>
          <button
            onClick={onCollapse}
            className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center py-4">
          <div className="text-xs font-medium text-text">No Project Selected</div>
          <div className="text-[11px] text-muted max-w-xs">
            Register a local Git repository to monitor your development activity.
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={onAddProject}
              className="inline-flex items-center gap-1.5 rounded-md bg-text px-3 py-1.5 text-xs font-medium text-bg hover:bg-white/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add Project
            </button>
            <button
              onClick={onOpenCenter}
              className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-text hover:bg-surface-3"
            >
              Command Center
            </button>
          </div>
        </div>
      </div>
    );
  }

  const unavailable = snapshot && !snapshot.ok;
  const isClean = snapshot?.ok && snapshot.modifiedCount + snapshot.stagedCount + snapshot.untrackedCount + snapshot.conflictCount === 0;

  return (
    <div className="flex h-full flex-col p-4 justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusDot tone={unavailable ? "err" : isClean ? "ok" : "warn"} />
          {projects.length > 1 ? (
            <select
              value={project.id}
              onChange={(e) => onSelectProject(e.target.value)}
              className="bg-transparent text-xs font-semibold text-text outline-none cursor-pointer hover:text-white"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-surface text-text">
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-semibold text-text truncate">{project.name}</span>
          )}

          {snapshot?.ok && snapshot.branch && (
            <button
              onClick={onOpenGitWorkflow}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-secondary hover:text-text cursor-pointer transition-colors"
              title="Open Git Workflow"
            >
              <GitBranch className="h-3 w-3 text-muted" />
              {snapshot.branch}
            </button>
          )}

          <button
            onClick={onOpenFolder}
            className="inline-flex items-center gap-1 rounded border border-border/80 bg-surface-2/60 px-1.5 py-0.5 font-mono text-[10.5px] text-secondary hover:text-text hover:border-border-strong hover:bg-surface-3 transition-colors cursor-pointer"
            title="Open repository folder in File Explorer"
          >
            <FolderOpen className="h-3 w-3 text-muted" />
            <span className="text-[10px]">Folder</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onCollapse}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text transition-colors"
            title="Collapse"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Body Grid */}
      {unavailable ? (
        <div className="flex flex-1 flex-col justify-center py-2 text-xs">
          <div className="font-medium text-error">Repository unavailable</div>
          <div className="text-[11px] text-muted truncate mt-0.5">{project.path}</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 py-2 flex-1 items-center">
          {/* Column 1: Git Status (Clickable to open Git Workflow) */}
          <div
            onClick={onOpenGitWorkflow}
            className="flex flex-col gap-1 text-[11.5px] border-r border-border/60 pr-3 cursor-pointer rounded-sm p-1 -m-1 hover:bg-surface-2/60 transition-colors group"
            title="Click to open Git Workflow (Add · Commit · Push)"
          >
            <div className="flex items-center justify-between">
              <div className="label-overline mb-0.5 group-hover:text-text transition-colors">Git Status</div>
              <GitPullRequest className="h-3 w-3 text-muted group-hover:text-text transition-colors" />
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Modified</span>
              <span className={cx("font-mono", (snapshot?.modifiedCount ?? 0) > 0 ? "text-warning font-medium" : "text-muted")}>
                {snapshot?.modifiedCount ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Staged</span>
              <span className={cx("font-mono", (snapshot?.stagedCount ?? 0) > 0 ? "text-success font-medium" : "text-muted")}>
                {snapshot?.stagedCount ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-secondary">Untracked</span>
              <span className="font-mono text-muted">{snapshot?.untrackedCount ?? 0}</span>
            </div>
            {snapshot && snapshot.conflictCount > 0 && (
              <div className="flex justify-between text-error font-medium">
                <span>Conflicts</span>
                <span className="font-mono">{snapshot.conflictCount}</span>
              </div>
            )}
          </div>

          {/* Column 2: Commits / Remote */}
          <div className="flex flex-col gap-1 text-[11.5px] min-w-0">
            {snapshot && (snapshot.behind > 0 || snapshot.ahead > 0) && (
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                {snapshot.behind > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-warning/10 border border-warning/20 px-1.5 py-0.5 font-mono text-[10.5px] text-warning">
                    ↓ {snapshot.behind} behind remote
                  </span>
                )}
                {snapshot.ahead > 0 && (
                  <span className="inline-flex items-center gap-1 rounded bg-surface-2 border border-border px-1.5 py-0.5 font-mono text-[10.5px] text-success">
                    ↑ {snapshot.ahead} unpushed
                  </span>
                )}
              </div>
            )}
            <div className="label-overline mb-0.5">Latest Commit</div>
            {snapshot && snapshot.commits.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Mono className="text-secondary text-[11px]">{shortHash(snapshot.commits[0].hash)}</Mono>
                  <span className="truncate text-xs text-text">{snapshot.commits[0].subject}</span>
                </div>
                <div className="text-[10px] text-muted flex items-center gap-1.5">
                  {snapshot.commits[0].author && <span className="text-secondary font-medium">{snapshot.commits[0].author}</span>}
                  <span>·</span>
                  <span>{relativeTime(snapshot.commits[0].iso)}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted">Clean working directory</div>
            )}

            {snapshot && snapshot.remotes.length > 0 && (
              <div className="mt-1">
                <div className="label-overline mb-0.5">Remote</div>
                <Mono className="truncate block text-muted text-[10.5px]">
                  {snapshot.remotes[0].replace(/^https?:\/\//, "").replace(/^git@/, "").replace(/:/, "/")}
                </Mono>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center gap-2 border-t border-border pt-2.5">
        <button
          onClick={onOpenGitWorkflow}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-3 hover:border-border-strong cursor-pointer whitespace-nowrap"
          title="Open Git Workflow (Add · Commit · Push)"
        >
          <GitPullRequest className="h-3 w-3" /> Git
        </button>

        <button
          onClick={onFetch}
          disabled={fetchBusy}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-text transition-colors hover:bg-surface-3 disabled:opacity-40 whitespace-nowrap"
        >
          {fetchBusy ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Fetching…
            </>
          ) : fetchResult === "ok" ? (
            <span className="text-success font-medium">✓ Fetched</span>
          ) : fetchResult === "err" ? (
            <span className="text-error font-medium">× Failed</span>
          ) : (
            <>
              <Download className="h-3 w-3" /> Fetch
            </>
          )}
        </button>

        <button
          onClick={onOpenTerminal}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs text-secondary transition-colors hover:bg-surface-3 hover:text-text whitespace-nowrap"
          title="Open Terminal"
        >
          <Terminal className="h-3 w-3" /> Terminal
        </button>

        <button
          onClick={onOpenCenter}
          className="ml-auto rounded-md bg-text px-3 py-1 text-xs font-medium text-bg transition-colors hover:bg-white/90 whitespace-nowrap shrink-0"
        >
          Command Center
        </button>
      </div>
    </div>
  );
}

// ---- Vertical Expanded Panel (Left / Right) --------------------------------
// Left / Right docking shares one component with an orientation-aware layout:
// a compact identity rail stays pinned to the screen edge and the detail pane
// grows away from it (rightward for LEFT, leftward for RIGHT).

function VerticalExpandedPanel({
  edge,
  project,
  projects,
  snapshot,
  recentEvents,
  fetchBusy,
  fetchResult,
  onSelectProject,
  onFetch,
  onOpenFolder,
  onOpenTerminal,
  onOpenGitWorkflow,
  onOpenCenter,
  onAddProject,
  onCollapse,
}: {
  edge: DockEdge;
  project: Project | null;
  projects: Project[];
  snapshot?: RepoSnapshot;
  recentEvents: DevPilotEvent[];
  fetchBusy: boolean;
  fetchResult: "ok" | "err" | null;
  onSelectProject: (id: string) => void;
  onFetch: () => void;
  onOpenFolder: () => void;
  onOpenTerminal: () => void;
  onOpenGitWorkflow: () => void;
  onOpenCenter: () => void;
  onAddProject: () => void;
  onCollapse: () => void;
}) {
  // Identity rail hugs the docked edge: collapse control at the top, the logo
  // alone pinned to the bottom. Content expands away from the rail.
  const rail = (
    <div
      className="flex w-[52px] shrink-0 flex-col items-center justify-between border-border py-3"
      style={{
        order: edge === "left" ? 0 : 2,
        borderRightWidth: edge === "left" ? 1 : 0,
        borderLeftWidth: edge === "right" ? 1 : 0,
      }}
    >
      <button
        onClick={onCollapse}
        title="Collapse"
        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
      >
        {edge === "left" ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
      </button>

      <Logo size={22} className="rounded-full" fit="cover" />
    </div>
  );

  const content = (
    <div className="flex min-w-0 flex-1 flex-col p-3" style={{ order: 1 }}>
      {!project ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <div className="text-xs font-medium text-text">No Project</div>
          <div className="text-[11px] leading-relaxed text-muted">
            Register a Git repository to monitor it here.
          </div>
          <button
            onClick={onAddProject}
            className="inline-flex items-center gap-1.5 rounded-md bg-text px-3 py-1.5 text-xs font-medium text-bg hover:bg-white/90"
          >
            <Plus className="h-3.5 w-3.5" /> Add Project
          </button>
          <button
            onClick={onOpenCenter}
            className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-text hover:bg-surface-3"
          >
            Command Center
          </button>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-2.5">
          {/* Header */}
          <div className="min-w-0 border-b border-border pb-2">
            {projects.length > 1 ? (
              <select
                value={project.id}
                onChange={(e) => onSelectProject(e.target.value)}
                className="w-full cursor-pointer bg-transparent text-[13px] font-semibold text-text outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-surface text-text">
                    {p.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="truncate text-[13px] font-semibold text-text">{project.name}</div>
            )}
            <div className="mt-0.5 flex items-center justify-between">
              <button
                onClick={onOpenGitWorkflow}
                className="inline-flex items-center gap-1.5 font-mono text-secondary hover:text-text cursor-pointer transition-colors truncate"
                title="Open Git Workflow"
              >
                <GitBranch className="h-3 w-3 shrink-0 text-muted" />
                <Mono className="truncate">
                  {snapshot?.ok ? snapshot.branch ?? "detached" : "—"}
                </Mono>
              </button>
            </div>
          </div>

          {/* Git status (Clickable to open Git Workflow) */}
          <div
            onClick={onOpenGitWorkflow}
            className="rounded border border-border bg-surface px-2.5 py-2 cursor-pointer hover:bg-surface-2/60 transition-colors group"
            title="Click to open Git Workflow (Add · Commit · Push)"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="label-overline group-hover:text-text transition-colors">Git</div>
              <GitPullRequest className="h-3 w-3 text-muted group-hover:text-text transition-colors" />
            </div>
            <div className="flex flex-col gap-1 text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-secondary">Modified</span>
                <span className={cx("font-mono", (snapshot?.modifiedCount ?? 0) > 0 ? "text-warning font-medium" : "text-muted")}>
                  {snapshot?.modifiedCount ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Staged</span>
                <span className={cx("font-mono", (snapshot?.stagedCount ?? 0) > 0 ? "text-success font-medium" : "text-muted")}>
                  {snapshot?.stagedCount ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Untracked</span>
                <span className="font-mono text-muted">{snapshot?.untrackedCount ?? 0}</span>
              </div>
              {snapshot && snapshot.conflictCount > 0 && (
                <div className="flex justify-between font-medium text-error">
                  <span>Conflicts</span>
                  <span className="font-mono">{snapshot.conflictCount}</span>
                </div>
              )}
              {snapshot && (snapshot.behind > 0 || snapshot.ahead > 0) && (
                <div className="flex justify-between border-t border-border/50 pt-1 mt-0.5 text-secondary">
                  <span>Remote</span>
                  <span className="font-mono flex items-center gap-1.5">
                    {snapshot.behind > 0 && <span className="text-warning font-medium">↓ {snapshot.behind}</span>}
                    {snapshot.ahead > 0 && <span className="text-success font-medium">↑ {snapshot.ahead}</span>}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          {recentEvents.length > 0 && (
            <div className="min-h-0 overflow-y-auto">
              <div className="label-overline mb-1">Recent Activity</div>
              <div className="flex flex-col gap-1">
                {recentEvents.map((e) => (
                  <div key={e.id} className="flex items-baseline gap-2 text-[11px]">
                    <span className="shrink-0 font-mono text-muted">{relativeTime(e.timestamp)}</span>
                    <span className="min-w-0 flex-1 truncate text-secondary">{e.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-2.5">
            <button
              onClick={onOpenGitWorkflow}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface-2 text-xs font-medium text-text transition-colors hover:bg-surface-3 hover:border-border-strong cursor-pointer"
              title="Open Git Workflow (Add · Commit · Push)"
            >
              <GitPullRequest className="h-3 w-3" /> Git Workflow
            </button>

            <button
              onClick={onFetch}
              disabled={fetchBusy}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface-2 text-xs font-medium text-text transition-colors hover:bg-surface-3 disabled:opacity-40"
            >
              {fetchBusy ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Fetching…
                </>
              ) : fetchResult === "ok" ? (
                <span className="font-medium text-success">✓ Fetch Completed</span>
              ) : fetchResult === "err" ? (
                <span className="font-medium text-error">× Fetch Failed</span>
              ) : (
                <>
                  <Download className="h-3 w-3" /> Fetch
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={onOpenFolder}
                className="flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-surface-2 text-xs text-secondary hover:bg-surface-3 hover:text-text"
              >
                <FolderOpen className="h-3 w-3" /> Folder
              </button>
              <button
                onClick={onOpenTerminal}
                className="flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-surface-2 text-xs text-secondary hover:bg-surface-3 hover:text-text"
              >
                <Terminal className="h-3 w-3" /> Terminal
              </button>
            </div>

            <button
              onClick={onOpenCenter}
              className="flex h-7 w-full items-center justify-center rounded-md bg-text text-xs font-medium text-bg hover:bg-white/90"
            >
              Command Center
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full w-full">
      {rail}
      {content}
    </div>
  );
}

// ---- Event Banner ----------------------------------------------------------

function EventBanner({
  event,
  onDismiss,
  isVertical,
}: {
  event: DevPilotEvent;
  onDismiss: () => void;
  isVertical: boolean;
}) {
  const critical = event.severity === "critical";

  if (isVertical) {
    return (
      <div className="event-banner-pop flex h-full flex-col items-center justify-between py-3 px-1 text-center">
        <StatusDot tone={critical ? "err" : "warn"} className="animate-pulse" />
        <div className="flex flex-col items-center gap-1 my-auto">
          <span className={cx("text-[10px] font-medium leading-tight", critical ? "text-error" : "text-warning")}>
            {event.title}
          </span>
          {event.projectName && (
            <span className="font-mono text-[9px] text-secondary truncate max-w-[44px]">
              {event.projectName}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDismiss();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
          }}
          className="relative z-50 flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text cursor-pointer transition-colors"
          title="Dismiss notification"
        >
          <X className="h-3.5 w-3.5 pointer-events-none" />
        </button>
      </div>
    );
  }

  return (
    <div className="event-banner-pop flex h-full items-center gap-2.5 px-3.5">
      <StatusDot tone={critical ? "err" : "warn"} className="animate-pulse shrink-0" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className={cx("truncate text-xs font-semibold tracking-tight", critical ? "text-error" : "text-warning")}>
          {event.title}
        </div>
        {(event.projectName || event.description) && (
          <div className="truncate font-mono text-[10.5px] text-secondary mt-0.5">
            {event.projectName ? `${event.projectName}${event.description ? " · " + event.description : ""}` : event.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onDismiss();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
        }}
        className="relative z-50 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text transition-colors cursor-pointer"
        title="Dismiss notification"
      >
        <X className="h-3.5 w-3.5 pointer-events-none" />
      </button>
    </div>
  );
}

async function currentRect(): Promise<PhysRect> {
  const [pos, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
  return { x: pos.x, y: pos.y, width: size.width, height: size.height };
}