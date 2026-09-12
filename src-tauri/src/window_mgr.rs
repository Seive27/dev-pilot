use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

use crate::models::{
    DockEdge, DockState, MonitorInfo, PhysRect, SnapResult,
};
use crate::persistence;

/// Margins: window padding around the pill (6px each side) + inset from the work area edge.
const PADDING: i32 = 6;
const EDGE_INSET: i32 = 10;
pub fn is_vertical_edge(edge: DockEdge) -> bool {
    matches!(edge, DockEdge::Left | DockEdge::Right)
}

/// The island's three visual states.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum IslandMode {
    /// Idle: a small circle showing only the Dev Pilot logo.
    Icon,
    /// Hover: a slightly larger pill revealing project / branch / status.
    Peek,
    /// Click: the full detail panel.
    Expanded,
}

pub fn parse_mode(mode: &str) -> IslandMode {
    match mode {
        "peek" => IslandMode::Peek,
        "expanded" => IslandMode::Expanded,
        _ => IslandMode::Icon,
    }
}

// Idle circle (the pill itself is square; the crop makes it a circle).
const ICON_SMALL: (i32, i32) = (36, 36);
const ICON_NORMAL: (i32, i32) = (40, 40);
const ICON_LARGE: (i32, i32) = (44, 44);

// Hover peek — horizontal (Top / Bottom): logo + name + branch + status on a row.
const PEEK_H_SMALL: (i32, i32) = (186, 36);
const PEEK_H_NORMAL: (i32, i32) = (208, 40);
const PEEK_H_LARGE: (i32, i32) = (232, 44);

// Hover peek — vertical (Left / Right): narrow column, still a compact strip.
const PEEK_V_SMALL: (i32, i32) = (52, 128);
const PEEK_V_NORMAL: (i32, i32) = (56, 142);
const PEEK_V_LARGE: (i32, i32) = (62, 158);

const PILL_H_EXPANDED: (i32, i32) = (440, 290);
const PILL_V_EXPANDED: (i32, i32) = (300, 430);

// Command Center window geometry.
const CC_DEFAULT: (i32, i32) = (860, 600);
const CC_MIN: (i32, i32) = (700, 460);
const CC_MAX: (i32, i32) = (1600, 1100);

/// Geometry saved by the previous default, migrated once to the new compact size.
const CC_OLD_DEFAULT: (i32, i32) = (980, 660);

pub fn island_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("island")
}

fn pill_size(app: &AppHandle, edge: DockEdge, mode: IslandMode) -> (i32, i32) {
    let settings = persistence::load_settings(app);
    let size = settings.island_size.as_str();
    let vertical = is_vertical_edge(edge);
    match (mode, vertical) {
        (IslandMode::Icon, _) => match size {
            "small" => ICON_SMALL,
            "large" => ICON_LARGE,
            _ => ICON_NORMAL,
        },
        (IslandMode::Peek, false) => match size {
            "small" => PEEK_H_SMALL,
            "large" => PEEK_H_LARGE,
            _ => PEEK_H_NORMAL,
        },
        (IslandMode::Peek, true) => match size {
            "small" => PEEK_V_SMALL,
            "large" => PEEK_V_LARGE,
            _ => PEEK_V_NORMAL,
        },
        (IslandMode::Expanded, true) => PILL_V_EXPANDED,
        (IslandMode::Expanded, false) => PILL_H_EXPANDED,
    }
}

/// Window size (physical px) for a docked pill. The docked axis reserves an
/// extra EDGE_INSET so the window can sit flush against the work-area edge
/// while the pill keeps its normal padding. That reserved strip is the visual
/// "edge root" gap the frontend draws into (see `EdgeRoot.tsx`).
pub fn window_size(app: &AppHandle, edge: DockEdge, mode: IslandMode) -> (i32, i32) {
    let (w, h) = pill_size(app, edge, mode);
    let pad = PADDING * 2;
    if is_vertical_edge(edge) {
        (w + pad + EDGE_INSET, h + pad)
    } else {
        (w + pad, h + pad + EDGE_INSET)
    }
}

// ---- monitor layout -------------------------------------------------------

#[cfg(windows)]
fn work_area_for(mon: &tauri::Monitor) -> Option<(i32, i32, i32, i32)> {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    unsafe {
        let pos = mon.position();
        let size = mon.size();
        let pt = POINT {
            x: pos.x + size.width as i32 / 2,
            y: pos.y + size.height as i32 / 2,
        };
        let hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        if hmon.0.is_null() {
            return None;
        }
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            rcMonitor: Default::default(),
            rcWork: Default::default(),
            dwFlags: 0,
        };
        if GetMonitorInfoW(hmon, &mut info).as_bool() {
            Some((
                info.rcWork.left,
                info.rcWork.top,
                info.rcWork.right - info.rcWork.left,
                info.rcWork.bottom - info.rcWork.top,
            ))
        } else {
            None
        }
    }
}

#[cfg(not(windows))]
fn work_area_for(mon: &tauri::Monitor) -> Option<(i32, i32, i32, i32)> {
    let pos = mon.position();
    let size = mon.size();
    Some((pos.x, pos.y, size.width as i32, size.height as i32))
}

pub fn monitor_info(mon: &tauri::Monitor, is_primary: bool) -> MonitorInfo {
    let pos = mon.position();
    let size = mon.size();
    let rect = PhysRect {
        x: pos.x,
        y: pos.y,
        width: size.width as i32,
        height: size.height as i32,
    };
    let work = work_area_for(mon)
        .map(|(x, y, w, h)| PhysRect { x, y, width: w, height: h })
        .unwrap_or(rect);
    MonitorInfo {
        id: format!("{}x{}x{}x{}", rect.x, rect.y, rect.width, rect.height),
        is_primary,
        scale: mon.scale_factor(),
        rect,
        work,
    }
}

pub fn screen_layout(app: &AppHandle) -> Vec<MonitorInfo> {
    let primary = app.primary_monitor().ok().flatten();
    let primary_id = primary.as_ref().map(|m| {
        let p = m.position();
        let s = m.size();
        format!("{}x{}x{}x{}", p.x, p.y, s.width, s.height)
    });
    let mut out = Vec::new();
    if let Ok(monitors) = app.available_monitors() {
        for mon in monitors {
            let info = monitor_info(&mon, Some(info_id(&mon)) == primary_id);
            out.push(info);
        }
    }
    if out.is_empty() {
        if let Some(m) = primary {
            out.push(monitor_info(&m, true));
        }
    }
    out
}

fn info_id(mon: &tauri::Monitor) -> String {
    let p = mon.position();
    let s = mon.size();
    format!("{}x{}x{}x{}", p.x, p.y, s.width, s.height)
}

fn find_monitor<'a>(layout: &'a [MonitorInfo], id: &str) -> Option<&'a MonitorInfo> {
    layout.iter().find(|m| m.id == id).or_else(|| layout.iter().find(|m| m.is_primary))
}

fn monitor_containing(layout: &[MonitorInfo], x: i32, y: i32) -> Option<&MonitorInfo> {
    layout
        .iter()
        .find(|m| {
            x >= m.work.x
                && x < m.work.x + m.work.width
                && y >= m.work.y
                && y < m.work.y + m.work.height
        })
        .or_else(|| {
            layout
                .iter()
                .min_by_key(|m| {
                    let cx = m.work.x + m.work.width / 2;
                    let cy = m.work.y + m.work.height / 2;
                    ((x - cx).pow(2) + (y - cy).pow(2)) as u64
                })
        })
}

// ---- geometry -------------------------------------------------------------

/// Compute the window rect (physical px) for a dock state.
pub fn dock_rect(app: &AppHandle, mon: &MonitorInfo, edge: DockEdge, offset: f64, mode: IslandMode) -> PhysRect {
    let (win_w, win_h) = window_size(app, edge, mode);
    let w = mon.work;
    let clamped = offset.clamp(0.0, 1.0);

    // Range the window can travel along the edge.
    let travel_x = (w.width - win_w - EDGE_INSET * 2).max(0) as f64;
    let travel_y = (w.height - win_h - EDGE_INSET * 2).max(0) as f64;

    // Anchor the docked side to the work-area edge; the EDGE_INSET folded into
    // `window_size` is the strip the root renders into. The pill itself keeps
    // its previous on-screen position.
    let (x, y) = match edge {
        DockEdge::Top => (
            (w.x + EDGE_INSET) + (travel_x * clamped).round() as i32,
            w.y,
        ),
        DockEdge::Bottom => (
            (w.x + EDGE_INSET) + (travel_x * clamped).round() as i32,
            w.y + w.height - win_h,
        ),
        DockEdge::Left => (
            w.x,
            (w.y + EDGE_INSET) + (travel_y * clamped).round() as i32,
        ),
        DockEdge::Right => (
            w.x + w.width - win_w,
            (w.y + EDGE_INSET) + (travel_y * clamped).round() as i32,
        ),
    };

    // Clamp along the docked edge only; the perpendicular axis stays flush with
    // the work-area edge so the root always meets the screen edge.
    let (x, y) = match edge {
        DockEdge::Top | DockEdge::Bottom => (
            x.clamp(w.x + EDGE_INSET, (w.x + w.width - EDGE_INSET - win_w).max(w.x + EDGE_INSET)),
            y,
        ),
        DockEdge::Left | DockEdge::Right => (
            x,
            y.clamp(w.y + EDGE_INSET, (w.y + w.height - EDGE_INSET - win_h).max(w.y + EDGE_INSET)),
        ),
    };

    PhysRect { x, y, width: win_w, height: win_h }
}

pub fn rect_from_pointer(
    app: &AppHandle,
    mon: &MonitorInfo,
    edge: DockEdge,
    px: f64,
    py: f64,
) -> (PhysRect, f64) {
    let (win_w, win_h) = window_size(app, edge, IslandMode::Icon);
    let w = mon.work;
    let travel_x = (w.width - win_w - EDGE_INSET * 2).max(1) as f64;
    let travel_y = (w.height - win_h - EDGE_INSET * 2).max(1) as f64;
    let offset = match edge {
        DockEdge::Top | DockEdge::Bottom => {
            ((px - (w.x + EDGE_INSET) as f64 - (win_w as f64 / 2.0)) / travel_x).clamp(0.0, 1.0)
        }
        DockEdge::Left | DockEdge::Right => {
            ((py - (w.y + EDGE_INSET) as f64 - (win_h as f64 / 2.0)) / travel_y).clamp(0.0, 1.0)
        }
    };
    (dock_rect(app, mon, edge, offset, IslandMode::Icon), offset)
}

// ---- actions --------------------------------------------------------------

pub fn dock(app: &AppHandle, edge: DockEdge, monitor_id: &str, offset: f64, mode: IslandMode) -> Result<DockState, String> {
    let layout = screen_layout(app);
    let mon = find_monitor(&layout, monitor_id)
        .ok_or_else(|| "no monitor found".to_string())?
        .clone();
    let rect = dock_rect(app, &mon, edge, offset, mode);
    apply_rect(app, &rect)?;
    let state = DockState {
        edge,
        monitor: mon.id.clone(),
        offset,
        expanded: mode == IslandMode::Expanded,
    };
    persistence::save_dock(app, &state);
    Ok(state)
}

/// Called on drag release. Chooses the nearest edge of the monitor under the
/// pointer and returns the target rect + state without moving the window
/// (the frontend tweens and then calls `finalize_dock`).
pub fn snap(app: &AppHandle, x: f64, y: f64) -> Result<SnapResult, String> {
    let layout = screen_layout(app);
    let (px, py) = (x.round() as i32, y.round() as i32);
    let mon = monitor_containing(&layout, px, py)
        .ok_or_else(|| "no monitor found".to_string())?
        .clone();

    let w = mon.work;

    // Distance from pointer to each work area boundary edge
    let candidates = [
        (DockEdge::Top, (py - w.y).abs()),
        (DockEdge::Bottom, (w.y + w.height - py).abs()),
        (DockEdge::Left, (px - w.x).abs()),
        (DockEdge::Right, (w.x + w.width - px).abs()),
    ];
    let (edge, _) = candidates
        .iter()
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .copied()
        .ok_or_else(|| "no edge".to_string())?;

    let (rect, offset) = rect_from_pointer(app, &mon, edge, x, y);
    let state = DockState {
        edge,
        monitor: mon.id.clone(),
        offset,
        expanded: false,
    };
    persistence::save_dock(app, &state);
    Ok(SnapResult { rect, state })
}

/// Target rect for the given mode, anchored to the saved dock position.
pub fn target_rect(app: &AppHandle, mode: IslandMode) -> Result<PhysRect, String> {
    let state = persistence::load_dock(app);
    let layout = screen_layout(app);
    let mon = find_monitor(&layout, &state.monitor)
        .ok_or_else(|| "no monitor found".to_string())?
        .clone();
    Ok(dock_rect(app, &mon, state.edge, state.offset, mode))
}

/// Hover rect for the current idle position. Derived from the island's live
/// rect so the logo stays put instead of jumping sideways when it grows: the
/// window expands around the icon's centre and along the docked edge.
pub fn peek_rect(app: &AppHandle) -> Result<PhysRect, String> {
    let win = island_window(app).ok_or_else(|| "island window missing".to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let icon = PhysRect {
        x: pos.x,
        y: pos.y,
        width: size.width as i32,
        height: size.height as i32,
    };
    let state = persistence::load_dock(app);
    let layout = screen_layout(app);
    let mon = find_monitor(&layout, &state.monitor)
        .ok_or_else(|| "no monitor found".to_string())?
        .clone();
    let (win_w, win_h) = window_size(app, state.edge, IslandMode::Peek);
    let w = mon.work;

    let (x, y) = match state.edge {
        DockEdge::Top | DockEdge::Bottom => {
            let cx = icon.x + icon.width / 2;
            let x = (cx - win_w / 2).clamp(w.x + EDGE_INSET, (w.x + w.width - EDGE_INSET - win_w).max(w.x + EDGE_INSET));
            let y = if state.edge == DockEdge::Top {
                w.y
            } else {
                w.y + w.height - win_h
            };
            (x, y)
        }
        DockEdge::Left | DockEdge::Right => {
            let cy = icon.y + icon.height / 2;
            let y = (cy - win_h / 2).clamp(w.y + EDGE_INSET, (w.y + w.height - EDGE_INSET - win_h).max(w.y + EDGE_INSET));
            let x = if state.edge == DockEdge::Left {
                w.x
            } else {
                w.x + w.width - win_w
            };
            (x, y)
        }
    };

    Ok(PhysRect { x, y, width: win_w, height: win_h })
}

/// Save the island's actual on-screen rect back into the dock state. Only the
/// idle (icon) rect defines the persisted anchor, so hovering or expanding never
/// drifts the island.
pub fn finalize(app: &AppHandle, mode: IslandMode) -> Result<(), String> {
    let state = persistence::load_dock(app);
    if mode != IslandMode::Icon {
        let state = DockState { expanded: mode == IslandMode::Expanded, ..state };
        persistence::save_dock(app, &state);
        return Ok(());
    }

    let win = island_window(app).ok_or_else(|| "island window missing".to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let rect = PhysRect {
        x: pos.x,
        y: pos.y,
        width: size.width as i32,
        height: size.height as i32,
    };
    let layout = screen_layout(app);
    let mon = find_monitor(&layout, &state.monitor);
    let (edge, monitor_id, offset) = if let Some(m) = mon {
        let w = m.work;
        let travel_x = (w.width - rect.width - EDGE_INSET * 2).max(0) as f64;
        let travel_y = (w.height - rect.height - EDGE_INSET * 2).max(0) as f64;
        let offset = match state.edge {
            DockEdge::Top | DockEdge::Bottom => {
                if travel_x > 0.0 {
                    ((rect.x - (w.x + EDGE_INSET)) as f64 / travel_x).clamp(0.0, 1.0)
                } else {
                    0.5
                }
            }
            DockEdge::Left | DockEdge::Right => {
                if travel_y > 0.0 {
                    ((rect.y - (w.y + EDGE_INSET)) as f64 / travel_y).clamp(0.0, 1.0)
                } else {
                    0.5
                }
            }
        };
        (state.edge, m.id.clone(), offset)
    } else {
        (state.edge, state.monitor.clone(), state.offset)
    };
    let state = DockState { edge, monitor: monitor_id, offset, expanded: false };
    persistence::save_dock(app, &state);
    Ok(())
}

fn apply_rect(app: &AppHandle, rect: &PhysRect) -> Result<(), String> {
    let win = island_window(app).ok_or_else(|| "island window missing".to_string())?;
    win.set_position(PhysicalPosition::new(rect.x, rect.y))
        .map_err(|e| e.to_string())?;
    win.set_size(PhysicalSize::new(rect.width as u32, rect.height as u32))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Restore the saved dock position on startup; falls back to the primary
/// monitor when the saved monitor is disconnected.
pub fn restore_dock(app: &AppHandle) -> Result<DockState, String> {
    let state = persistence::load_dock(app);
    let layout = screen_layout(app);
    let mon = find_monitor(&layout, &state.monitor);
    let mon = match mon {
        Some(m) => m.clone(),
        None => {
            let fallback = layout
                .iter()
                .find(|m| m.is_primary)
                .cloned()
                .or_else(|| layout.first().cloned())
                .ok_or_else(|| "no monitors".to_string())?;
            fallback
        }
    };
    let rect = dock_rect(app, &mon, state.edge, state.offset, IslandMode::Icon);
    apply_rect(app, &rect)?;
    let restored = DockState {
        edge: state.edge,
        monitor: mon.id.clone(),
        offset: state.offset,
        expanded: false,
    };
    persistence::save_dock(app, &restored);

    // The persisted dock state is the single source of truth for the edge, so
    // mirror it into Settings on launch. Without this, a settings file written
    // before docking existed could disagree with where the island actually sits.
    let edge = match restored.edge {
        DockEdge::Top => "top",
        DockEdge::Bottom => "bottom",
        DockEdge::Left => "left",
        DockEdge::Right => "right",
    };
    let mut settings = persistence::load_settings(app);
    if settings.dock_position != edge {
        settings.dock_position = edge.to_string();
        persistence::save_settings(app, &settings);
        let _ = app.emit("devpilot:settings-updated", &settings);
    }

    Ok(restored)
}

pub fn show_island(app: &AppHandle) {
    if let Some(w) = island_window(app) {
        let _ = w.show();
    }
}

pub fn hide_island(app: &AppHandle) {
    if let Some(w) = island_window(app) {
        let _ = w.hide();
    }
}

pub fn open_command_center(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("command-center") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Hide the Command Center without terminating Dev Pilot. The window is kept
/// alive so the island, tray and `open_command_center` can restore it later.
pub fn close_command_center(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("command-center") {
        let _ = w.hide();
    }
}

pub fn close_target_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("close-target")
}

pub fn show_close_target(app: &AppHandle, x: i32, y: i32, hovered: bool) -> Result<(), String> {
    if let Some(w) = close_target_window(app) {
        let _ = w.set_position(PhysicalPosition::new(x - 48, y - 48));
        let _ = w.show();
        let _ = app.emit("devpilot:close-target-state", hovered);
    }
    Ok(())
}

pub fn set_close_target_state(app: &AppHandle, hovered: bool) -> Result<(), String> {
    let _ = app.emit("devpilot:close-target-state", hovered);
    Ok(())
}

pub fn hide_close_target(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = close_target_window(app) {
        let _ = w.hide();
    }
    let _ = app.emit("devpilot:close-target-state", false);
    Ok(())
}

// ---- command center geometry ----------------------------------------------

fn rect_visible(layout: &[MonitorInfo], x: i32, y: i32, w: i32, h: i32) -> bool {
    // Require a meaningful amount of the window to sit inside a connected
    // monitor's work area, so a disconnected display never hides the window.
    layout.iter().any(|m| {
        let work = m.work;
        let ix = (x + w).min(work.x + work.width) - x.max(work.x);
        let iy = (y + h).min(work.y + work.height) - y.max(work.y);
        ix > 120 && iy > 80
    })
}

/// Restore the Command Center window to its remembered size and position,
/// falling back to a centered compact window when the saved geometry is gone.
pub fn restore_command_center(app: &AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("command-center")
        .ok_or_else(|| "command center window missing".to_string())?;
    let settings = persistence::load_settings(app);

    // One-time migration: geometry saved under the previous, larger default is
    // replaced by the new compact default instead of pinning the window open.
    let (saved_w, saved_h) = match (settings.cc_width, settings.cc_height) {
        (Some(w), Some(h)) if (w, h) == CC_OLD_DEFAULT => (None, None),
        (w, h) => (w, h),
    };
    let w = saved_w.unwrap_or(CC_DEFAULT.0).clamp(CC_MIN.0, CC_MAX.0);
    let h = saved_h.unwrap_or(CC_DEFAULT.1).clamp(CC_MIN.1, CC_MAX.1);
    let layout = screen_layout(app);

    let saved = match (settings.cc_x, settings.cc_y) {
        (Some(x), Some(y)) if rect_visible(&layout, x, y, w, h) => Some((x, y)),
        _ => None,
    };

    let (x, y) = match saved {
        Some(p) => p,
        None => {
            let mon = layout
                .iter()
                .find(|m| m.is_primary)
                .or_else(|| layout.first())
                .cloned();
            match mon {
                Some(m) => (
                    m.work.x + (m.work.width - w) / 2,
                    m.work.y + (m.work.height - h) / 2,
                ),
                None => (60, 60),
            }
        }
    };

    let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
    Ok(())
}