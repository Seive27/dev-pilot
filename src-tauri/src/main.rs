#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod events;
mod git;
mod models;
mod monitor;
mod persistence;
mod processes;
mod state;
mod system;
mod tray;
mod window_mgr;

use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second instance was launched: surface the island.
            let state = app.state::<state::AppState>();
            *state.island_dismissed.lock().unwrap() = false;
            if let Some(w) = app.get_webview_window("island") {
                let _ = w.show();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(state::AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            tray::setup_tray(&handle)?;

            let mut settings = persistence::load_settings(&handle);

            // Launch always presents the Dynamic Island. The Command Center is
            // opened on demand only (island double-click or tray menu) and is
            // never shown during startup.
            let _ = window_mgr::restore_dock(&handle);
            settings.show_island = true;
            persistence::save_settings(&handle, &settings);
            window_mgr::show_island(&handle);

            // Prepare the Command Center's remembered geometry while it stays
            // hidden; this never opens it.
            let _ = window_mgr::restore_command_center(&handle);
            if let Some(cc) = handle.get_webview_window("command-center") {
                let _ = cc.hide();
            }

            // Closing a window hides it to the tray when "minimize to tray" is
            // on; otherwise closing the Command Center exits Dev Pilot.
            if let Some(w) = handle.get_webview_window("island") {
                let h = handle.clone();
                let win = w.clone();
                w.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let settings = persistence::load_settings(&h);
                        if settings.minimize_to_tray {
                            api.prevent_close();
                            let _ = win.hide();
                        }
                    }
                });
            }
            if let Some(w) = handle.get_webview_window("command-center") {
                let h = handle.clone();
                let win = w.clone();
                w.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let settings = persistence::load_settings(&h);
                        if settings.minimize_to_tray {
                            api.prevent_close();
                            let _ = win.hide();
                        } else {
                            // Explicit close means quit — Dev Pilot is a companion,
                            // not a background service when the user opts out.
                            api.prevent_close();
                            h.exit(0);
                        }
                    }
                });
            }

            if let Some(w) = handle.get_webview_window("close-target") {
                let win = w.clone();
                w.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }

            // Background monitor for all registered repositories.
            monitor::start(&handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_screen_layout,
            commands::get_dock_state,
            commands::dock_island,
            commands::snap_dock,
            commands::island_target_rect,
            commands::island_peek_rect,
            commands::finalize_dock,
            commands::show_island,
            commands::hide_island,
            commands::dismiss_island,
            commands::restore_island,
            commands::show_close_target,
            commands::set_close_target_state,
            commands::hide_close_target,
            commands::open_command_center,
            commands::close_command_center,
            commands::get_settings,
            commands::save_settings,
            commands::save_command_center_rect,
            commands::get_projects,
            commands::add_project,
            commands::update_project,
            commands::remove_project,
            commands::check_is_git,
            commands::get_repo_snapshot,
            commands::git_fetch,
            commands::git_pull,
            commands::git_push,
            commands::open_in_explorer,
            commands::open_terminal,
            commands::get_timeline,
            commands::log_event,
            commands::get_builds,
            commands::start_build,
            commands::get_dev_servers,
            commands::start_dev_server,
            commands::stop_dev_server,
            commands::get_system_stats,
            commands::detect_stack,
            commands::get_active_project,
            commands::set_active_project,
            commands::quit_app,
            commands::rebuild_tray,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Dev Pilot");

    app.run(|_app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            // Normal exit path (tray -> Exit Dev Pilot).
        }
    });
}