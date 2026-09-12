use std::collections::HashMap;
use std::sync::Mutex;

use tauri::tray::TrayIcon;

use crate::models::{BuildState, DevServerState, RepoSnapshot};
use crate::system::{CpuSample, NetSample};

pub struct AppState {
    /// Latest git snapshot per project (kept by the monitor loop).
    pub snapshots: Mutex<HashMap<String, RepoSnapshot>>,
    /// Build state per project.
    pub builds: Mutex<HashMap<String, BuildState>>,
    /// Dev server state per project.
    pub dev: Mutex<HashMap<String, DevServerState>>,
    /// Keeps the tray icon alive and lets us rebuild its menu.
    pub tray: Mutex<Option<TrayIcon>>,
    /// Projects currently flagged unavailable (to avoid duplicate events).
    pub unavailable: Mutex<std::collections::HashSet<String>>,
    /// Cached CPU sample for delta computation.
    pub cpu: Mutex<CpuSample>,
    /// Cached network counters for rate computation.
    pub net: Mutex<NetSample>,
    /// Cached last-seen remote commit heads per project:branch
    pub last_remote_heads: Mutex<HashMap<String, String>>,
    /// Runtime session-only dismissal state for Dynamic Island
    pub island_dismissed: Mutex<bool>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            snapshots: Mutex::new(HashMap::new()),
            builds: Mutex::new(HashMap::new()),
            dev: Mutex::new(HashMap::new()),
            tray: Mutex::new(None),
            unavailable: Mutex::new(std::collections::HashSet::new()),
            cpu: Mutex::new(CpuSample::default()),
            net: Mutex::new(NetSample::default()),
            last_remote_heads: Mutex::new(HashMap::new()),
            island_dismissed: Mutex::new(false),
        }
    }
}