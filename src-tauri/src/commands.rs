use std::path::Path;
use std::process::Command;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;

use crate::events;
use crate::git;
use crate::models::{
    AppSettings, DevPilotEvent, DockEdge, DockState, MonitorInfo, PhysRect, Project, SnapResult,
};
use crate::persistence;
use crate::processes;
use crate::state::AppState;
use crate::system;
use crate::window_mgr;

// ---- window / dock --------------------------------------------------------

#[tauri::command]
pub fn get_screen_layout(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    Ok(window_mgr::screen_layout(&app))
}

#[tauri::command]
pub fn get_dock_state(app: AppHandle) -> DockState {
    persistence::load_dock(&app)
}

#[tauri::command]
pub fn dock_island(
    app: AppHandle,
    edge: DockEdge,
    monitor: String,
    offset: f64,
    mode: String,
) -> Result<DockState, String> {
    window_mgr::dock(&app, edge, &monitor, offset, window_mgr::parse_mode(&mode))
}

#[tauri::command]
pub fn snap_dock(app: AppHandle, x: f64, y: f64) -> Result<SnapResult, String> {
    window_mgr::snap(&app, x, y)
}

#[tauri::command]
pub fn island_target_rect(app: AppHandle, mode: String) -> Result<PhysRect, String> {
    window_mgr::target_rect(&app, window_mgr::parse_mode(&mode))
}

#[tauri::command]
pub fn island_peek_rect(app: AppHandle) -> Result<PhysRect, String> {
    window_mgr::peek_rect(&app)
}

#[tauri::command]
pub fn finalize_dock(app: AppHandle, mode: String) -> Result<(), String> {
    window_mgr::finalize(&app, window_mgr::parse_mode(&mode))
}

#[tauri::command]
pub fn dismiss_island(app: AppHandle) {
    let state = app.state::<AppState>();
    *state.island_dismissed.lock().unwrap() = true;
    let _ = window_mgr::hide_close_target(&app);
    window_mgr::hide_island(&app);
    let _ = app.emit("devpilot:island-dismissed", true);
}

#[tauri::command]
pub fn restore_island(app: AppHandle) {
    let state = app.state::<AppState>();
    *state.island_dismissed.lock().unwrap() = false;
    window_mgr::show_island(&app);
    let _ = app.emit("devpilot:island-dismissed", false);
}

#[tauri::command]
pub fn show_island(app: AppHandle) {
    restore_island(app);
}

#[tauri::command]
pub fn hide_island(app: AppHandle) {
    dismiss_island(app);
}

#[tauri::command]
pub fn open_command_center(app: AppHandle) {
    window_mgr::open_command_center(&app);
}

#[tauri::command]
pub fn close_command_center(app: AppHandle) {
    window_mgr::close_command_center(&app);
}

#[tauri::command]
pub fn show_close_target(app: AppHandle, x: i32, y: i32, hovered: bool) -> Result<(), String> {
    window_mgr::show_close_target(&app, x, y, hovered)
}

#[tauri::command]
pub fn set_close_target_state(app: AppHandle, hovered: bool) -> Result<(), String> {
    window_mgr::set_close_target_state(&app, hovered)
}

#[tauri::command]
pub fn hide_close_target(app: AppHandle) -> Result<(), String> {
    window_mgr::hide_close_target(&app)
}

/// Persist the Command Center window geometry (called on move/resize).
#[tauri::command]
pub fn save_command_center_rect(app: AppHandle, x: i32, y: i32, width: i32, height: i32) {
    let mut settings = persistence::load_settings(&app);
    settings.cc_x = Some(x);
    settings.cc_y = Some(y);
    settings.cc_width = Some(width);
    settings.cc_height = Some(height);
    persistence::save_settings(&app, &settings);
}

// ---- settings -------------------------------------------------------------

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    persistence::load_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    let settings = settings.validate();
    persistence::save_settings(&app, &settings);

    // Apply autostart immediately (registers/unregisters with Windows).
    let autolaunch = app.autolaunch();
    if settings.autostart {
        let _ = autolaunch.enable();
    } else {
        let _ = autolaunch.disable();
    }

    // Apply "show Dynamic Island" immediately.
    if settings.show_island {
        let state = app.state::<AppState>();
        *state.island_dismissed.lock().unwrap() = false;
        window_mgr::show_island(&app);
    } else {
        window_mgr::hide_island(&app);
    }

    // Let every window (island included) react to the new settings.
    let _ = app.emit("devpilot:settings-updated", &settings);

    Ok(())
}

// ---- projects -------------------------------------------------------------

#[tauri::command]
pub fn get_projects(app: AppHandle) -> Vec<Project> {
    persistence::load_projects(&app)
}

#[tauri::command]
pub fn check_is_git(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("path does not exist".to_string());
    }
    Ok(git::is_git_repo(p))
}

#[tauri::command]
pub fn get_active_project(app: AppHandle) -> Option<String> {
    let settings = persistence::load_settings(&app);
    let projects = persistence::load_projects(&app);
    if let Some(id) = settings.active_project_id {
        if projects.iter().any(|p| p.id == id) {
            return Some(id);
        }
    }
    projects.first().map(|p| p.id.clone())
}

#[tauri::command]
pub fn set_active_project(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let mut settings = persistence::load_settings(&app);
    settings.active_project_id = id.clone();
    persistence::save_settings(&app, &settings);
    let _ = app.emit("devpilot:active-project", &id);
    Ok(())
}

#[tauri::command]
pub fn add_project(
    app: AppHandle,
    name: String,
    path: String,
    build_command: Option<String>,
    dev_command: Option<String>,
    dev_port: Option<u16>,
) -> Result<Project, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("the folder does not exist".to_string());
    }
    if !git::is_git_repo(p) {
        return Err("this folder is not a Git repository".to_string());
    }

    let mut projects = persistence::load_projects(&app);
    if projects.iter().any(|x| x.path == path) {
        return Err("this repository is already registered".to_string());
    }

    let now = events::now_iso();
    let id = format!("proj-{}", chrono::Local::now().timestamp_millis());
    let project = Project {
        id: id.clone(),
        name,
        path: path.clone(),
        icon: None,
        monitoring: true,
        created_at: now,
        settings: crate::models::ProjectSettings {
            build_command,
            dev_command,
            dev_port,
        },
    };
    projects.push(project.clone());
    persistence::save_projects(&app, &projects);

    let mut settings = persistence::load_settings(&app);
    if settings.active_project_id.is_none() {
        settings.active_project_id = Some(id.clone());
        persistence::save_settings(&app, &settings);
        let _ = app.emit("devpilot:active-project", &Some(id.clone()));
    }

    // Immediately cache initial snapshot
    let snap = git::read_snapshot(Path::new(&path), &id);
    let state = app.state::<AppState>();
    state.snapshots.lock().unwrap().insert(id.clone(), snap.clone());

    crate::tray::rebuild(&app);
    let _ = app.emit("devpilot:projects-updated", &projects);
    let _ = app.emit("devpilot:snapshot-updated", &snap);

    events::emit(
        &app,
        Some(&project),
        crate::models::EVENT_PROJECT_ADDED,
        "medium",
        "Project registered",
        Some(project.path.clone()),
        None,
    );

    Ok(project)
}

#[tauri::command]
pub fn update_project(app: AppHandle, project: Project) -> Result<Project, String> {
    let mut projects = persistence::load_projects(&app);
    let idx = projects
        .iter()
        .position(|p| p.id == project.id)
        .ok_or_else(|| "project not found".to_string())?;
    projects[idx] = project.clone();
    persistence::save_projects(&app, &projects);
    crate::tray::rebuild(&app);
    let _ = app.emit("devpilot:projects-updated", &projects);
    Ok(project)
}

#[tauri::command]
pub fn remove_project(app: AppHandle, id: String) -> Result<(), String> {
    let mut projects = persistence::load_projects(&app);
    projects.retain(|p| p.id != id);
    persistence::save_projects(&app, &projects);

    let mut settings = persistence::load_settings(&app);
    if settings.active_project_id.as_deref() == Some(&id) {
        settings.active_project_id = projects.first().map(|p| p.id.clone());
        persistence::save_settings(&app, &settings);
        let _ = app.emit("devpilot:active-project", &settings.active_project_id);
    }

    let state = app.state::<AppState>();
    state.snapshots.lock().unwrap().remove(&id);
    state.builds.lock().unwrap().remove(&id);
    state.dev.lock().unwrap().remove(&id);
    state.unavailable.lock().unwrap().remove(&id);

    crate::tray::rebuild(&app);
    let _ = app.emit("devpilot:projects-updated", &projects);
    events::emit(
        &app,
        None,
        crate::models::EVENT_PROJECT_REMOVED,
        "low",
        "Project removed",
        None,
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn get_repo_snapshot(app: AppHandle, id: String) -> crate::models::RepoSnapshot {
    let state = app.state::<AppState>();
    let cached = state.snapshots.lock().unwrap().get(&id).cloned();
    match cached {
        Some(snap) if snap.ok || !snap.checked_at.is_empty() => snap,
        _ => {
            let project = persistence::find_project(&app, &id);
            match project {
                Some(p) => git::read_snapshot(Path::new(&p.path), &id),
                None => crate::models::RepoSnapshot::failed(&id, "project not found".to_string()),
            }
        }
    }
}

#[tauri::command]
pub fn detect_stack(app: AppHandle, id: String) -> Vec<String> {
    match persistence::find_project(&app, &id) {
        Some(p) => git::detect_stack(Path::new(&p.path)),
        None => Vec::new(),
    }
}

// ---- git actions ----------------------------------------------------------

fn run_git_action(app: &AppHandle, project_id: &str, args: Vec<&str>, action: &str) -> Result<(), String> {
    let project = persistence::find_project(app, project_id)
        .ok_or_else(|| "project not found".to_string())?;
    if !Path::new(&project.path).exists() {
        return Err("repository path does not exist".to_string());
    }
    events::git_action_started(app, &project, action);

    let handle = app.clone();
    let pid = project_id.to_string();
    let path = project.path.clone();
    let name = project.name.clone();
    let action = action.to_string();
    let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    std::thread::spawn(move || {
        let mut cmd = Command::new("git");
        cmd.current_dir(&path).args(&args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        let out = cmd.output();
        let (ok, detail) = match out {
            Ok(o) => {
                let status_ok = o.status.success();
                let text = if status_ok {
                    String::from_utf8_lossy(&o.stdout).trim().to_string()
                } else {
                    String::from_utf8_lossy(&o.stderr).trim().to_string()
                };
                let detail = if text.is_empty() {
                    None
                } else {
                    Some(text.chars().take(200).collect::<String>())
                };
                (status_ok, detail)
            }
            Err(e) => (false, Some(format!("failed to run git: {e}"))),
        };
        let project = persistence::find_project(&handle, &pid)
            .unwrap_or_else(|| crate::models::Project {
                id: pid.clone(),
                name: name.clone(),
                path: path.clone(),
                icon: None,
                monitoring: true,
                created_at: events::now_iso(),
                settings: Default::default(),
            });
        events::git_action_done(&handle, &project, &action, ok, detail);
        if ok {
            let snap = git::read_snapshot(Path::new(&path), &pid);
            let state = handle.state::<AppState>();
            state.snapshots.lock().unwrap().insert(pid.clone(), snap.clone());
            let _ = handle.emit("devpilot:snapshot-updated", &snap);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn git_fetch(app: AppHandle, id: String) -> Result<(), String> {
    run_git_action(&app, &id, vec!["fetch", "--prune"], "fetch")
}

#[tauri::command]
pub fn git_pull(app: AppHandle, id: String) -> Result<(), String> {
    run_git_action(&app, &id, vec!["pull", "--ff-only"], "pull")
}

#[tauri::command]
pub fn git_push(app: AppHandle, id: String) -> Result<(), String> {
    run_git_action(&app, &id, vec!["push"], "push")
}

// ---- open / terminal ------------------------------------------------------

#[tauri::command]
pub fn open_in_explorer(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("path does not exist".to_string());
    }
    Command::new("explorer").arg(path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn open_terminal(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("path does not exist".to_string());
    }
    #[cfg(windows)]
    {
        let wt = Command::new("wt.exe").args(["-d", &path]).spawn();
        if wt.is_err() {
            let _ = Command::new("cmd")
                .args(["/C", "start", "", "cmd", "/K", "cd", "/d", &path])
                .spawn();
        }
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("sh").arg("-c").arg(format!("cd '{}' && $SHELL", path)).spawn();
    }
    Ok(())
}

// ---- timeline / events ----------------------------------------------------

#[tauri::command]
pub fn get_timeline(app: AppHandle) -> Vec<DevPilotEvent> {
    persistence::load_events(&app)
}

#[tauri::command]
pub fn log_event(app: AppHandle, event: DevPilotEvent) {
    persistence::append_event(&app, &event);
    let _ = app.emit("devpilot:event", &event);
}

// ---- builds / dev servers -------------------------------------------------

#[tauri::command]
pub fn get_builds(app: AppHandle) -> Vec<crate::models::BuildState> {
    processes::get_builds(&app)
}

#[tauri::command]
pub fn start_build(app: AppHandle, id: String) -> Result<(), String> {
    processes::start_build(&app, &id)
}

#[tauri::command]
pub fn get_dev_servers(app: AppHandle) -> Vec<crate::models::DevServerState> {
    processes::refresh_dev_servers(&app)
}

#[tauri::command]
pub fn start_dev_server(app: AppHandle, id: String) -> Result<(), String> {
    processes::start_dev_server(&app, &id)
}

#[tauri::command]
pub fn stop_dev_server(app: AppHandle, id: String) -> Result<(), String> {
    processes::stop_dev_server(&app, &id)
}

// ---- system ---------------------------------------------------------------

#[tauri::command]
pub fn get_system_stats(app: AppHandle) -> crate::models::SystemStats {
    let settings = persistence::load_settings(&app);
    let state = app.state::<AppState>();
    let mut cpu = state.cpu.lock().unwrap();
    let mut net = state.net.lock().unwrap();
    system::stats(
        &mut cpu,
        &mut net,
        settings.cpu_monitoring,
        settings.ram_monitoring,
        settings.network_monitoring,
    )
}

// ---- app ------------------------------------------------------------------

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn rebuild_tray(app: AppHandle) {
    crate::tray::rebuild(&app);
}