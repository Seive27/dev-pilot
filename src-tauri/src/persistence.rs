use std::fs;
use std::path::PathBuf;

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::models::{AppSettings, DevPilotEvent, DockState, Project};

pub const PROJECTS_FILE: &str = "projects.json";
pub const SETTINGS_FILE: &str = "settings.json";
pub const DOCK_FILE: &str = "dock.json";
pub const EVENTS_FILE: &str = "events.json";
pub const REMOTE_STATE_FILE: &str = "remote_state.json";
pub const MAX_EVENTS: usize = 300;

pub fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn read_json<T: DeserializeOwned>(app: &AppHandle, file: &str) -> Option<T> {
    let path = config_dir(app).join(file);
    let text = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_json<T: Serialize + ?Sized>(app: &AppHandle, file: &str, value: &T) {
    let dir = config_dir(app);
    let _ = fs::create_dir_all(&dir);
    let path = dir.join(file);
    let tmp = dir.join(format!("{file}.tmp"));
    if let Ok(text) = serde_json::to_string_pretty(value) {
        if fs::write(&tmp, text).is_ok() {
            let _ = fs::rename(&tmp, &path);
        }
    }
}

// ---- projects -------------------------------------------------------------

pub fn load_projects(app: &AppHandle) -> Vec<Project> {
    read_json(app, PROJECTS_FILE).unwrap_or_default()
}

pub fn save_projects(app: &AppHandle, projects: &[Project]) {
    write_json(app, PROJECTS_FILE, projects);
}

pub fn find_project(app: &AppHandle, id: &str) -> Option<Project> {
    load_projects(app).into_iter().find(|p| p.id == id)
}

// ---- settings -------------------------------------------------------------

pub fn load_settings(app: &AppHandle) -> AppSettings {
    read_json::<AppSettings>(app, SETTINGS_FILE)
        .map(AppSettings::validate)
        .unwrap_or_else(AppSettings::with_defaults)
}

pub fn save_settings(app: &AppHandle, settings: &AppSettings) {
    write_json(app, SETTINGS_FILE, &settings.clone().validate());
}

// ---- dock state -----------------------------------------------------------

pub fn load_dock(app: &AppHandle) -> DockState {
    read_json(app, DOCK_FILE).unwrap_or_default()
}

pub fn save_dock(app: &AppHandle, dock: &DockState) {
    write_json(app, DOCK_FILE, dock);
}

// ---- activity timeline ----------------------------------------------------

pub fn load_events(app: &AppHandle) -> Vec<DevPilotEvent> {
    read_json(app, EVENTS_FILE).unwrap_or_default()
}

pub fn append_event(app: &AppHandle, event: &DevPilotEvent) {
    let mut events = load_events(app);
    events.insert(0, event.clone());
    events.truncate(MAX_EVENTS);
    write_json(app, EVENTS_FILE, &events);
}

// ---- remote state persistence ---------------------------------------------

pub fn load_remote_state<T: DeserializeOwned>(app: &AppHandle) -> Option<T> {
    read_json(app, REMOTE_STATE_FILE)
}

pub fn save_remote_state<T: Serialize + ?Sized>(app: &AppHandle, state: &T) {
    write_json(app, REMOTE_STATE_FILE, state);
}