use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager};

use crate::persistence;
use crate::state::AppState;
use crate::window_mgr;

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show-island", "Show Dynamic Island", true, None::<&str>)?;
    let center = MenuItem::with_id(app, "open-center", "Open Command Center", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let projects = persistence::load_projects(app);
    let mut items: Vec<tauri::menu::MenuItem<tauri::Wry>> = Vec::new();
    for p in projects {
        items.push(MenuItem::with_id(
            app,
            format!("project:{}", p.id),
            &p.name,
            true,
            None::<&str>,
        )?);
    }
    let projects_menu = if items.is_empty() {
        let none = MenuItem::with_id(
            app,
            "no-projects",
            "No projects registered",
            false,
            None::<&str>,
        )?;
        Submenu::with_items(app, "Projects", true, &[&none as &dyn IsMenuItem<tauri::Wry>])?
    } else {
        let refs: Vec<&dyn IsMenuItem<tauri::Wry>> =
            items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
        Submenu::with_items(app, "Projects", true, &refs)?
    };

    let settings = MenuItem::with_id(app, "open-settings", "Settings", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let exit = MenuItem::with_id(app, "exit", "Exit Dev Pilot", true, None::<&str>)?;

    Menu::with_items(app, &[&show, &center, &sep1, &projects_menu, &settings, &sep2, &exit])
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;

    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Dev Pilot")
        .on_menu_event(|app, event| handle_menu_event(app, event))
        .build(app)?;

    let state = app.state::<AppState>();
    *state.tray.lock().unwrap() = Some(tray);
    Ok(())
}

/// Rebuild the tray menu after projects change.
pub fn rebuild(app: &AppHandle) {
    let state = app.state::<AppState>();
    {
        let mut tray = state.tray.lock().unwrap();
        *tray = None;
    }
    let _ = setup_tray(app);
}

pub fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    match id {
        "show-island" => {
            let state = app.state::<AppState>();
            *state.island_dismissed.lock().unwrap() = false;
            window_mgr::show_island(app);
            let _ = app.emit("devpilot:island-dismissed", false);
        }
        "open-center" => window_mgr::open_command_center(app),
        "open-settings" => {
            window_mgr::open_command_center(app);
            let _ = app.emit("devpilot:navigate", "settings");
        }
        "exit" => {
            app.exit(0);
        }
        other => {
            if let Some(project_id) = other.strip_prefix("project:") {
                window_mgr::open_command_center(app);
                let _ = app.emit("devpilot:tray-project", project_id);
            }
        }
    }
}