import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  BuildState,
  DevPilotEvent,
  DevServerState,
  DockEdge,
  DockState,
  GitActionResult,
  GitWorkflowStatus,
  IslandMode,
  MonitorInfo,
  PhysRect,
  Project,
  RepoSnapshot,
  SnapResult,
  SystemStats,
} from "../types";

export const ipc = {
  // window / dock
  getScreenLayout: () => invoke<MonitorInfo[]>("get_screen_layout"),
  getDockState: () => invoke<DockState>("get_dock_state"),
  dockIsland: (edge: DockEdge, monitor: string, offset: number, mode: IslandMode) =>
    invoke<DockState>("dock_island", { edge, monitor, offset, mode }),
  snapDock: (x: number, y: number) => invoke<SnapResult>("snap_dock", { x, y }),
  islandTargetRect: (mode: IslandMode) =>
    invoke<PhysRect>("island_target_rect", { mode }),
  islandPeekRect: () => invoke<PhysRect>("island_peek_rect"),
  finalizeDock: (mode: IslandMode) => invoke<void>("finalize_dock", { mode }),
  showIsland: () => invoke<void>("show_island"),
  hideIsland: () => invoke<void>("hide_island"),
  dismissIsland: () => invoke<void>("dismiss_island"),
  restoreIsland: () => invoke<void>("restore_island"),
  showCloseTarget: (x: number, y: number, hovered: boolean) =>
    invoke<void>("show_close_target", { x, y, hovered }),
  setCloseTargetState: (hovered: boolean) =>
    invoke<void>("set_close_target_state", { hovered }),
  hideCloseTarget: () => invoke<void>("hide_close_target"),
  openCommandCenter: () => invoke<void>("open_command_center"),
  closeCommandCenter: () => invoke<void>("close_command_center"),
  saveCommandCenterRect: (x: number, y: number, width: number, height: number) =>
    invoke<void>("save_command_center_rect", { x, y, width, height }),

  // settings
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    invoke<void>("save_settings", { settings }),

  // projects
  getProjects: () => invoke<Project[]>("get_projects"),
  checkIsGit: (path: string) => invoke<boolean>("check_is_git", { path }),
  addProject: (
    name: string,
    path: string,
    buildCommand?: string | null,
    devCommand?: string | null,
    devPort?: number | null
  ) =>
    invoke<Project>("add_project", {
      name,
      path,
      buildCommand: buildCommand ?? null,
      devCommand: devCommand ?? null,
      devPort: devPort ?? null,
    }),
  updateProject: (project: Project) => invoke<Project>("update_project", { project }),
  removeProject: (id: string) => invoke<void>("remove_project", { id }),
  getActiveProject: () => invoke<string | null>("get_active_project"),
  setActiveProject: (id: string | null) => invoke<void>("set_active_project", { id }),
  getRepoSnapshot: (id: string) => invoke<RepoSnapshot>("get_repo_snapshot", { id }),
  detectStack: (id: string) => invoke<string[]>("detect_stack", { id }),

  // git actions
  gitFetch: (id: string) => invoke<void>("git_fetch", { id }),
  gitPull: (id: string) => invoke<void>("git_pull", { id }),
  gitPush: (id: string) => invoke<void>("git_push", { id }),
  gitGetWorkflowStatus: (projectId: string) =>
    invoke<GitWorkflowStatus>("git_get_workflow_status", { projectId }),
  gitStageAll: (projectId: string) =>
    invoke<GitActionResult>("git_stage_all", { projectId }),
  gitStageFiles: (projectId: string, files: string[]) =>
    invoke<GitActionResult>("git_stage_files", { projectId, files }),
  gitUnstageFiles: (projectId: string, files: string[]) =>
    invoke<GitActionResult>("git_unstage_files", { projectId, files }),
  gitCommitChanges: (projectId: string, message: string) =>
    invoke<GitActionResult>("git_commit_changes", { projectId, message }),
  gitPushWorkflow: (
    projectId: string,
    remote?: string | null,
    branch?: string | null,
    setUpstream?: boolean
  ) =>
    invoke<GitActionResult>("git_push_workflow", {
      projectId,
      remote: remote ?? null,
      branch: branch ?? null,
      setUpstream: setUpstream ?? false,
    }),
  openGitWorkflow: (projectId?: string | null) =>
    invoke<void>("open_git_workflow", { projectId: projectId ?? null }),
  openInExplorer: (path: string) => invoke<void>("open_in_explorer", { path }),
  openTerminal: (path: string) => invoke<void>("open_terminal", { path }),

  // timeline
  getTimeline: () => invoke<DevPilotEvent[]>("get_timeline"),
  logEvent: (event: DevPilotEvent) => invoke<void>("log_event", { event }),

  // builds / dev servers
  getBuilds: () => invoke<BuildState[]>("get_builds"),
  startBuild: (id: string) => invoke<void>("start_build", { id }),
  getDevServers: () => invoke<DevServerState[]>("get_dev_servers"),
  startDevServer: (id: string) => invoke<void>("start_dev_server", { id }),
  stopDevServer: (id: string) => invoke<void>("stop_dev_server", { id }),

  // system
  getSystemStats: () => invoke<SystemStats>("get_system_stats"),

  // app
  quitApp: () => invoke<void>("quit_app"),
  rebuildTray: () => invoke<void>("rebuild_tray"),
};