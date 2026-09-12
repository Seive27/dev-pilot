use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

use tauri::{AppHandle, Manager};

use crate::events::{self, now_iso};
use crate::models::{BuildState, DevServerState, Project};
use crate::persistence;
use crate::state::AppState;

const MAX_LOG_LINES: usize = 400;
const DEV_START_TIMEOUT_SECS: i64 = 45;

fn elapsed_secs(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| (chrono::Utc::now().naive_utc() - dt.naive_utc()).num_seconds().max(0))
        .unwrap_or(0)
}

fn placeholder_project(id: &str, name: &str, path: &str) -> Project {
    Project {
        id: id.to_string(),
        name: name.to_string(),
        path: path.to_string(),
        icon: None,
        monitoring: true,
        created_at: now_iso(),
        settings: Default::default(),
    }
}

// ---- builds ---------------------------------------------------------------

pub fn start_build(app: &AppHandle, project_id: &str) -> Result<(), String> {
    let project = persistence::find_project(app, project_id)
        .ok_or_else(|| "project not found".to_string())?;
    let command = project
        .settings
        .build_command
        .clone()
        .ok_or_else(|| "no build command configured for this project".to_string())?;

    let state = app.state::<AppState>();
    {
        let mut builds = state.builds.lock().unwrap();
        if builds
            .get(project_id)
            .map(|b| b.status == "building")
            .unwrap_or(false)
        {
            return Err("a build is already in progress".to_string());
        }
        builds.insert(
            project_id.to_string(),
            BuildState {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                status: "building".to_string(),
                command: Some(command.clone()),
                started_at: Some(now_iso()),
                finished_at: None,
                exit_code: None,
                log: vec![format!("$ {command}")],
            },
        );
    }

    events::build_started(app, &project, &command);

    let handle = app.clone();
    let pid = project_id.to_string();
    let path = project.path.clone();
    let name = project.name.clone();

    std::thread::spawn(move || {
        let started = Instant::now();
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", &command])
            .current_dir(&path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let out = cmd.output();

        let state = handle.state::<AppState>();
        let (status, exit_code, tail) = {
            let mut builds = state.builds.lock().unwrap();
            let entry = builds.entry(pid.clone()).or_insert_with(|| BuildState {
                project_id: pid.clone(),
                project_name: name.clone(),
                status: "building".to_string(),
                command: Some(command.clone()),
                started_at: Some(now_iso()),
                finished_at: None,
                exit_code: None,
                log: Vec::new(),
            });

            match out {
                Ok(output) => {
                    let mut combined = output.stdout;
                    combined.extend_from_slice(&output.stderr);
                    let text = String::from_utf8_lossy(&combined);
                    for line in text.lines() {
                        entry.log.push(line.to_string());
                        if entry.log.len() > MAX_LOG_LINES {
                            entry.log.remove(0);
                        }
                    }
                    let code = output.status.code().unwrap_or(-1);
                    entry.exit_code = Some(code);
                    entry.finished_at = Some(now_iso());
                    entry.status = if code == 0 { "success" } else { "failed" }.to_string();
                    let tail = entry
                        .log
                        .iter()
                        .rev()
                        .take(12)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n");
                    (entry.status.clone(), code, tail)
                }
                Err(e) => {
                    entry.exit_code = None;
                    entry.finished_at = Some(now_iso());
                    entry.status = "failed".to_string();
                    entry.log.push(format!("failed to launch build: {e}"));
                    let tail = format!("failed to launch build: {e}");
                    (entry.status.clone(), -1, tail)
                }
            }
        };

        let project = persistence::find_project(&handle, &pid)
            .unwrap_or_else(|| placeholder_project(&pid, &name, &path));
        let duration_ms = started.elapsed().as_millis() as u64;
        if status == "success" {
            events::build_success(&handle, &project, duration_ms);
        } else {
            events::build_failed(&handle, &project, exit_code, &tail);
        }
    });

    Ok(())
}

pub fn get_builds(app: &AppHandle) -> Vec<BuildState> {
    let state = app.state::<AppState>();
    let projects = persistence::load_projects(app);
    let builds = state.builds.lock().unwrap();
    let mut out: Vec<BuildState> = Vec::new();
    for p in &projects {
        if let Some(b) = builds.get(&p.id) {
            out.push(b.clone());
        } else {
            out.push(BuildState {
                project_id: p.id.clone(),
                project_name: p.name.clone(),
                status: "idle".to_string(),
                command: p.settings.build_command.clone(),
                started_at: None,
                finished_at: None,
                exit_code: None,
                log: Vec::new(),
            });
        }
    }
    out
}

// ---- dev servers ----------------------------------------------------------

fn detect_port(path: &Path) -> Option<u16> {
    let pkg = path.join("package.json");
    if let Ok(text) = std::fs::read_to_string(&pkg) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            let dev = v
                .get("scripts")
                .and_then(|s| s.get("dev"))
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_lowercase();
            let probes = [
                ("vite preview", 4173),
                ("vite", 5173),
                ("next", 3000),
                ("react-scripts", 3000),
                ("expo", 8081),
                ("astro", 4321),
                ("svelte", 5173),
                ("nuxt", 3000),
                ("remix", 3000),
                ("gatsby", 8000),
                ("django", 8000),
                ("flask", 5000),
            ];
            for (kw, port) in probes {
                if dev.contains(kw) {
                    return Some(port);
                }
            }
        }
    }
    None
}

pub fn probe_port(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn default_port(path: &Path) -> u16 {
    detect_port(path).unwrap_or(5173)
}

pub fn refresh_dev_servers(app: &AppHandle) -> Vec<DevServerState> {
    let projects = persistence::load_projects(app);
    let state = app.state::<AppState>();
    let mut dev = state.dev.lock().unwrap();
    let mut out = Vec::new();

    for p in &projects {
        let Some(dev_cmd) = p.settings.dev_command.clone() else {
            continue;
        };
        let port = p
            .settings
            .dev_port
            .unwrap_or_else(|| default_port(Path::new(&p.path)));
        let running = probe_port(port);

        let entry = dev.entry(p.id.clone()).or_insert_with(|| DevServerState {
            project_id: p.id.clone(),
            project_name: p.name.clone(),
            status: "stopped".to_string(),
            port: Some(port),
            command: Some(dev_cmd.clone()),
            started_at: None,
            detected: false,
            pid: None,
        });
        entry.project_name = p.name.clone();
        entry.command = Some(dev_cmd.clone());
        entry.port = Some(port);

        let prev_status = entry.status.clone();
        if running {
            if prev_status != "running" {
                entry.status = "running".to_string();
                entry.detected = true;
                if entry.started_at.is_none() {
                    events::dev_server_started(app, p, Some(port));
                }
                entry.started_at = entry.started_at.clone().or_else(|| Some(now_iso()));
            }
        } else {
            match prev_status.as_str() {
                "running" => {
                    entry.status = "stopped".to_string();
                    entry.detected = false;
                    events::dev_server_stopped(app, p);
                }
                "starting" => {
                    let too_long = entry
                        .started_at
                        .as_ref()
                        .map(|s| elapsed_secs(s) > DEV_START_TIMEOUT_SECS)
                        .unwrap_or(false);
                    if too_long {
                        entry.status = "crashed".to_string();
                        events::dev_server_crashed(app, p);
                    }
                }
                "crashed" => {}
                _ => {
                    entry.status = "stopped".to_string();
                }
            }
        }
        out.push(entry.clone());
    }
    out
}

#[cfg(windows)]
const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

pub fn start_dev_server(app: &AppHandle, project_id: &str) -> Result<(), String> {
    let project = persistence::find_project(app, project_id)
        .ok_or_else(|| "project not found".to_string())?;
    let dev_cmd = project
        .settings
        .dev_command
        .clone()
        .ok_or_else(|| "no dev command configured for this project".to_string())?;

    let port = project
        .settings
        .dev_port
        .unwrap_or_else(|| default_port(Path::new(&project.path)));

    if probe_port(port) {
        return Err(format!("a dev server is already listening on port {port}"));
    }

    let cmdline = format!("cd /d \"{}\" && {}", project.path, dev_cmd);
    #[cfg(windows)]
    let child = Command::new("cmd")
        .args(["/K", &cmdline])
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn();
    #[cfg(not(windows))]
    let child = Command::new("sh").arg("-c").arg(&cmdline).spawn();

    let child = child.map_err(|e| format!("failed to start dev server: {e}"))?;
    let pid = child.id();

    let state = app.state::<AppState>();
    {
        let mut dev = state.dev.lock().unwrap();
        dev.insert(
            project_id.to_string(),
            DevServerState {
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                status: "starting".to_string(),
                port: Some(port),
                command: Some(dev_cmd.clone()),
                started_at: Some(now_iso()),
                detected: false,
                pid: Some(pid),
            },
        );
    }
    Ok(())
}

pub fn stop_dev_server(app: &AppHandle, project_id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let pid = {
        let dev = state.dev.lock().unwrap();
        dev.get(project_id).and_then(|d| d.pid)
    };
    if let Some(pid) = pid {
        #[cfg(windows)]
        {
            let mut cmd = Command::new("taskkill");
            cmd.args(["/T", "/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW);
            let _ = cmd.output();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").arg(pid.to_string()).output();
        }
        let mut dev = state.dev.lock().unwrap();
        if let Some(e) = dev.get_mut(project_id) {
            e.status = "stopped".to_string();
            e.pid = None;
        }
    }
    Ok(())
}