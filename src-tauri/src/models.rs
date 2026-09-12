use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default = "default_true")]
    pub monitoring: bool,
    pub created_at: String,
    #[serde(default)]
    pub settings: ProjectSettings,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub build_command: Option<String>,
    pub dev_command: Option<String>,
    pub dev_port: Option<u16>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoSnapshot {
    pub project_id: String,
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub detached: bool,
    pub head: Option<String>,
    pub files: Vec<RepoFile>,
    pub modified_count: usize,
    pub staged_count: usize,
    pub untracked_count: usize,
    pub conflict_count: usize,
    pub stash_count: usize,
    pub rebasing: bool,
    pub commits: Vec<CommitInfo>,
    pub remotes: Vec<String>,
    pub stack: Vec<String>,
    pub checked_at: String,
}

impl RepoSnapshot {
    pub fn failed(project_id: &str, error: String) -> Self {
        RepoSnapshot {
            project_id: project_id.to_string(),
            ok: false,
            error: Some(error),
            ..Default::default()
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepoFile {
    pub status: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub subject: String,
    pub author: String,
    pub iso: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitActionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub snapshot: Option<RepoSnapshot>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkflowFile {
    pub path: String,
    pub status: String,
    pub staged: bool,
    pub status_label: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkflowStatus {
    pub project_id: String,
    pub project_name: String,
    pub path: String,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub remote_name: Option<String>,
    pub remote_url: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub detached: bool,
    pub files: Vec<GitWorkflowFile>,
    pub modified_count: usize,
    pub staged_count: usize,
    pub untracked_count: usize,
    pub latest_commit: Option<CommitInfo>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DockEdge {
    Top,
    Bottom,
    Left,
    Right,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DockState {
    pub edge: DockEdge,
    pub monitor: String,
    pub offset: f64,
    pub expanded: bool,
}

impl Default for DockState {
    fn default() -> Self {
        DockState {
            edge: DockEdge::Top,
            monitor: String::new(),
            offset: 0.5,
            expanded: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
// `default` keeps forward/backward compatibility: a field missing from an older
// settings file falls back to its default instead of discarding every setting.
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub autostart: bool,
    pub start_minimized: bool,
    pub minimize_to_tray: bool,
    pub show_island: bool,
    pub island_size: String,
    pub dock_position: String,
    pub animation: bool,
    pub auto_hide_delay: u64,
    pub monitoring_enabled: bool,
    pub polling_interval: u64,
    pub remote_monitoring_enabled: bool,
    pub remote_polling_interval: u64,
    pub notify_on_remote_commits: bool,
    pub notify_on_pull_requests: bool,
    pub notify_on_ci_failures: bool,
    pub cpu_monitoring: bool,
    pub ram_monitoring: bool,
    pub network_monitoring: bool,
    #[serde(default)]
    pub active_project_id: Option<String>,
    // Command Center window geometry (physical px), persisted across launches.
    #[serde(default)]
    pub cc_x: Option<i32>,
    #[serde(default)]
    pub cc_y: Option<i32>,
    #[serde(default)]
    pub cc_width: Option<i32>,
    #[serde(default)]
    pub cc_height: Option<i32>,
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings::with_defaults()
    }
}

/// Valid island size values, in order: Small, Default, Large.
pub const ISLAND_SIZES: [&str; 3] = ["small", "normal", "large"];
/// Valid polling intervals (seconds).
pub const POLLING_INTERVALS: [u64; 6] = [1, 2, 5, 10, 30, 60];
/// Valid remote polling intervals (seconds). 60s, 120s, 300s (5m), 600s (10m), 900s (15m), 1800s (30m).
pub const REMOTE_POLLING_INTERVALS: [u64; 6] = [60, 120, 300, 600, 900, 1800];
/// Valid auto-hide delays (seconds; 0 = never).
pub const AUTO_HIDE_DELAYS: [u64; 6] = [0, 1, 2, 3, 5, 10];

pub fn valid_dock_position(v: &str) -> bool {
    matches!(v, "top" | "bottom" | "left" | "right")
}

impl AppSettings {
    pub fn with_defaults() -> Self {
        AppSettings {
            autostart: false,
            start_minimized: false,
            minimize_to_tray: true,
            show_island: true,
            island_size: "normal".into(),
            dock_position: "top".into(),
            animation: true,
            auto_hide_delay: 3,
            monitoring_enabled: true,
            polling_interval: 5,
            remote_monitoring_enabled: true,
            remote_polling_interval: 300, // 5 minutes default
            notify_on_remote_commits: true,
            notify_on_pull_requests: true,
            notify_on_ci_failures: true,
            cpu_monitoring: false,
            ram_monitoring: false,
            network_monitoring: false,
            active_project_id: None,
            cc_x: None,
            cc_y: None,
            cc_width: None,
            cc_height: None,
        }
    }

    /// Coerce every field into a valid value. Never fails — corrupt settings
    /// fall back to defaults so Dev Pilot always launches.
    pub fn validate(mut self) -> Self {
        let d = AppSettings::with_defaults();
        self.island_size = if ISLAND_SIZES.contains(&self.island_size.as_str()) {
            self.island_size
        } else {
            d.island_size
        };
        self.dock_position = if valid_dock_position(&self.dock_position) {
            self.dock_position
        } else {
            d.dock_position
        };
        if !POLLING_INTERVALS.contains(&self.polling_interval) {
            self.polling_interval = d.polling_interval;
        }
        if !REMOTE_POLLING_INTERVALS.contains(&self.remote_polling_interval) {
            self.remote_polling_interval = d.remote_polling_interval;
        }
        if !AUTO_HIDE_DELAYS.contains(&self.auto_hide_delay) {
            self.auto_hide_delay = d.auto_hide_delay;
        }
        // Only discard obviously corrupt window geometry — legitimate sizes are
        // clamped to the window's min/max when the Command Center is restored.
        if let Some(w) = self.cc_width {
            if !(400..=6000).contains(&w) {
                self.cc_width = None;
            }
        }
        if let Some(h) = self.cc_height {
            if !(300..=4000).contains(&h) {
                self.cc_height = None;
            }
        }
        self
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DevPilotEvent {
    pub id: String,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub r#type: String,
    pub severity: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub timestamp: String,
    #[serde(default)]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuildState {
    pub project_id: String,
    pub project_name: String,
    pub status: String,
    pub command: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub log: Vec<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DevServerState {
    pub project_id: String,
    pub project_name: String,
    pub status: String,
    pub port: Option<u16>,
    pub command: Option<String>,
    pub started_at: Option<String>,
    pub detected: bool,
    pub pid: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    /// Whether each collector is enabled — lets the UI render honest state.
    pub cpu_enabled: bool,
    pub ram_enabled: bool,
    pub network_enabled: bool,
    pub cpu_percent: f64,
    pub ram_percent: f64,
    pub ram_used_gb: f64,
    pub ram_total_gb: f64,
    pub net_rx_kbps: f64,
    pub net_tx_kbps: f64,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PhysRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub is_primary: bool,
    pub scale: f64,
    pub rect: PhysRect,
    pub work: PhysRect,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SnapResult {
    pub rect: PhysRect,
    pub state: DockState,
}

pub const EVENT_FILE_CHANGED: &str = "FILE_CHANGED";
pub const EVENT_COMMIT_CREATED: &str = "COMMIT_CREATED";
pub const EVENT_PUSH_COMPLETED: &str = "PUSH_COMPLETED";
pub const EVENT_PULL_COMPLETED: &str = "PULL_COMPLETED";
pub const EVENT_FETCH_COMPLETED: &str = "FETCH_COMPLETED";
pub const EVENT_BRANCH_CHANGED: &str = "BRANCH_CHANGED";
pub const EVENT_BUILD_STARTED: &str = "BUILD_STARTED";
pub const EVENT_BUILD_SUCCESS: &str = "BUILD_SUCCESS";
pub const EVENT_BUILD_FAILED: &str = "BUILD_FAILED";
pub const EVENT_DEV_SERVER_STARTED: &str = "DEV_SERVER_STARTED";
pub const EVENT_DEV_SERVER_STOPPED: &str = "DEV_SERVER_STOPPED";
pub const EVENT_DEV_SERVER_CRASHED: &str = "DEV_SERVER_CRASHED";
pub const EVENT_MERGE_CONFLICT: &str = "MERGE_CONFLICT";
pub const EVENT_REPOSITORY_UNAVAILABLE: &str = "REPOSITORY_UNAVAILABLE";
pub const EVENT_REPOSITORY_RESTORED: &str = "REPOSITORY_RESTORED";
pub const EVENT_PROJECT_ADDED: &str = "PROJECT_ADDED";
pub const EVENT_PROJECT_REMOVED: &str = "PROJECT_REMOVED";
pub const EVENT_GIT_ACTION_STARTED: &str = "GIT_ACTION_STARTED";
pub const EVENT_GIT_ACTION_FAILED: &str = "GIT_ACTION_FAILED";
pub const EVENT_SYNC_CHANGED: &str = "SYNC_CHANGED";
pub const EVENT_STASH_UPDATED: &str = "STASH_UPDATED";
pub const EVENT_REBASE_STARTED: &str = "REBASE_STARTED";

// Remote event constants
pub const EVENT_REMOTE_COMMIT: &str = "REMOTE_COMMIT";
pub const EVENT_REMOTE_BRANCH_CHANGED: &str = "REMOTE_BRANCH_CHANGED";
pub const EVENT_PULL_REQUEST_OPENED: &str = "PULL_REQUEST_OPENED";
pub const EVENT_REVIEW_REQUESTED: &str = "REVIEW_REQUESTED";
pub const EVENT_PULL_REQUEST_APPROVED: &str = "PULL_REQUEST_APPROVED";
pub const EVENT_CHANGES_REQUESTED: &str = "CHANGES_REQUESTED";
pub const EVENT_CI_FAILED: &str = "CI_FAILED";
pub const EVENT_REMOTE_UNAVAILABLE: &str = "REMOTE_UNAVAILABLE";