export interface ProjectSettings {
  buildCommand?: string | null;
  devCommand?: string | null;
  devPort?: number | null;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  icon?: string | null;
  monitoring: boolean;
  createdAt: string;
  settings: ProjectSettings;
}

export interface RepoFile {
  status: string;
  path: string;
}

export interface CommitInfo {
  hash: string;
  subject: string;
  author: string;
  iso: string;
}

export interface GitActionResult {
  success: boolean;
  output: string;
  error?: string | null;
  snapshot?: RepoSnapshot | null;
}

export interface GitWorkflowFile {
  path: string;
  status: string;
  staged: boolean;
  statusLabel: string;
}

export interface GitWorkflowStatus {
  projectId: string;
  projectName: string;
  path: string;
  branch?: string | null;
  upstream?: string | null;
  remoteName?: string | null;
  remoteUrl?: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  files: GitWorkflowFile[];
  modifiedCount: number;
  stagedCount: number;
  untrackedCount: number;
  latestCommit?: CommitInfo | null;
}

export interface RepoSnapshot {
  projectId: string;
  ok: boolean;
  error?: string | null;
  branch?: string | null;
  upstream?: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  head?: string | null;
  files: RepoFile[];
  modifiedCount: number;
  stagedCount: number;
  untrackedCount: number;
  conflictCount: number;
  stashCount: number;
  rebasing: boolean;
  commits: CommitInfo[];
  remotes: string[];
  stack: string[];
  checkedAt: string;
}

export type DockEdge = "top" | "bottom" | "left" | "right";

/** Island visual states: idle logo circle, hover peek, or the full panel. */
export type IslandMode = "icon" | "peek" | "expanded";

export interface DockState {
  edge: DockEdge;
  monitor: string;
  offset: number;
  expanded: boolean;
}

export interface PhysRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonitorInfo {
  id: string;
  isPrimary: boolean;
  scale: number;
  rect: PhysRect;
  work: PhysRect;
}

export interface SnapResult {
  rect: PhysRect;
  state: DockState;
}

export type IslandSize = "small" | "normal" | "large";

export interface AppSettings {
  autostart: boolean;
  startMinimized: boolean;
  minimizeToTray: boolean;
  showIsland: boolean;
  islandSize: IslandSize;
  dockPosition: DockEdge;
  animation: boolean;
  autoHideDelay: number;
  monitoringEnabled: boolean;
  pollingInterval: number;
  remoteMonitoringEnabled: boolean;
  remotePollingInterval: number;
  notifyOnRemoteCommits: boolean;
  notifyOnPullRequests: boolean;
  notifyOnCiFailures: boolean;
  cpuMonitoring: boolean;
  ramMonitoring: boolean;
  networkMonitoring: boolean;
  notificationSound: boolean;
  customNotificationSound?: string | null;
  activeProjectId?: string | null;
  ccX?: number | null;
  ccY?: number | null;
  ccWidth?: number | null;
  ccHeight?: number | null;
}

export type Severity = "low" | "medium" | "high" | "critical";

export interface DevPilotEvent {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  type: string;
  severity: Severity;
  title: string;
  description?: string | null;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface BuildState {
  projectId: string;
  projectName: string;
  status: "idle" | "building" | "success" | "failed";
  command?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  exitCode?: number | null;
  log: string[];
}

export interface DevServerState {
  projectId: string;
  projectName: string;
  status: "running" | "stopped" | "crashed" | "starting";
  port?: number | null;
  command?: string | null;
  startedAt?: string | null;
  detected: boolean;
}

export interface SystemStats {
  cpuEnabled: boolean;
  ramEnabled: boolean;
  networkEnabled: boolean;
  cpuPercent: number;
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  netRxKbps: number;
  netTxKbps: number;
}

export const EVENT_TYPES = {
  FILE_CHANGED: "FILE_CHANGED",
  COMMIT_CREATED: "COMMIT_CREATED",
  PUSH_COMPLETED: "PUSH_COMPLETED",
  PULL_COMPLETED: "PULL_COMPLETED",
  FETCH_COMPLETED: "FETCH_COMPLETED",
  BRANCH_CHANGED: "BRANCH_CHANGED",
  BUILD_STARTED: "BUILD_STARTED",
  BUILD_SUCCESS: "BUILD_SUCCESS",
  BUILD_FAILED: "BUILD_FAILED",
  DEV_SERVER_STARTED: "DEV_SERVER_STARTED",
  DEV_SERVER_STOPPED: "DEV_SERVER_STOPPED",
  DEV_SERVER_CRASHED: "DEV_SERVER_CRASHED",
  MERGE_CONFLICT: "MERGE_CONFLICT",
  REPOSITORY_UNAVAILABLE: "REPOSITORY_UNAVAILABLE",
  REPOSITORY_RESTORED: "REPOSITORY_RESTORED",
  PROJECT_ADDED: "PROJECT_ADDED",
  PROJECT_REMOVED: "PROJECT_REMOVED",
  GIT_ACTION_STARTED: "GIT_ACTION_STARTED",
  GIT_ACTION_FAILED: "GIT_ACTION_FAILED",
  SYNC_CHANGED: "SYNC_CHANGED",
  STASH_UPDATED: "STASH_UPDATED",
  REBASE_STARTED: "REBASE_STARTED",
  REMOTE_COMMIT: "REMOTE_COMMIT",
  REMOTE_BRANCH_CHANGED: "REMOTE_BRANCH_CHANGED",
  PULL_REQUEST_OPENED: "PULL_REQUEST_OPENED",
  REVIEW_REQUESTED: "REVIEW_REQUESTED",
  PULL_REQUEST_APPROVED: "PULL_REQUEST_APPROVED",
  CHANGES_REQUESTED: "CHANGES_REQUESTED",
  CI_FAILED: "CI_FAILED",
  REMOTE_UNAVAILABLE: "REMOTE_UNAVAILABLE",
} as const;

export type Page =
  | "overview"
  | "projects"
  | "activity"
  | "git"
  | "builds"
  | "processes"
  | "settings";