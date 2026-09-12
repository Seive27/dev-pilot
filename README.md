# Dev Pilot

A lightweight Windows developer command center. Dev Pilot lives in a floating
**Dynamic Island** that docks to any screen edge, expands intelligently toward
the center of the screen, and monitors every local Git repository you register —
without copying, moving, or modifying your files.

Built with **Tauri 2 · Rust · React · TypeScript · Tailwind CSS · Vite · Zustand**.

> Not Electron. Compiles to a native Windows `.exe` installer via NSIS.

---

## Prerequisites

- [Rust](https://rustup.rs/) (stable, MSVC toolchain)
- [Node.js](https://nodejs.org/) 20+
- Git (used by the backend for real repository status)
- WebView2 runtime (preinstalled on Windows 10/11)

## Development

```bash
npm install
npm run tauri:dev        # launches the app with hot reload
```

`npm run tauri:dev` starts Vite on port 1420 and opens two Tauri windows:

- **island** — the Dynamic Island (transparent, frameless, always-on-top)
- **command-center** — the full window (hidden until you open it)

## Production build

```bash
npm run tauri:build      # release build + NSIS installer
```

Output: `src-tauri/target/release/bundle/nsis/Dev Pilot_0.1.0_x64-setup.exe`.

A plain executable (no installer) can be produced with
`npx tauri build --no-bundle`.

## Using Dev Pilot

1. Launch the app. The island appears near the top edge of your primary monitor.
2. **Drag** the island to any screen edge — a subtle `TOP DOCK` / `RIGHT DOCK`
   preview appears near an edge, and it snaps into place on release. Position
   and monitor are remembered; if the monitor is disconnected it falls back to
   the primary display.
3. **Click** the island to expand it **in place** — it grows away from the
   docked edge (down from the top, up from the bottom, rightward from the left,
   leftward from the right) and never leaves the monitor.
4. **Double-click** or use the **Command Center** button to open the full window.
5. Open **Projects → Add Project**, pick any folder, and Dev Pilot validates it
   is a Git repository before registering it.
6. Right-click the **tray icon** for quick access: Show Island, Open Command
   Center, per-project shortcuts, Settings, Exit.

Closing a window minimizes to the tray (configurable in Settings). Enable
**Launch on Windows startup** + **Start minimized** in Settings for a quiet
background utility.

## What Dev Pilot monitors

- Real `git status` per repository (modified / staged / untracked / conflicts /
  ahead / behind / stashes / rebase state) via the Rust backend — no fake data.
- Branch changes, new commits, remote sync changes — surfaced through a
  centralized event engine (`src-tauri/src/events.rs`) with severity levels
  (low / medium / high / critical) that drive island notifications.
- Optional build command (`npm run build`, …) — run, watch, view raw output.
- Optional dev command (`npm run dev`, …) — start, stop, and detect the
  listening port (Vite, Next.js, Expo, Django, …).
- CPU / RAM usage in the Command Center (Windows API).

## Architecture

```
src/                    React + TypeScript frontend
  island/               Dynamic Island window (drag, snap, expand)
  components/           Command Center shell, dialogs, toasts, rows
  pages/                Overview · Projects · Activity · Git · Builds · Processes · Settings
  stores/               Zustand stores (settings, projects, events, dock, ui, system)
  lib/                  typed IPC wrappers, monitor/drag geometry

src-tauri/              Rust backend
  src/window_mgr.rs     monitors, work areas (taskbar-aware), dock/snap/expand math
  src/git.rs            real git command execution + snapshot parsing
  src/monitor.rs        background poll loop emitting change events
  src/events.rs         centralized event engine (persisted activity timeline)
  src/processes.rs      build runner + dev-server detection
  src/tray.rs           system tray with dynamic project menu
  src/system.rs         CPU/RAM via the Windows API
  src/persistence.rs    local JSON storage in %APPDATA%
```

React owns UI, animation, and state presentation. All native operations —
Git, filesystem, processes, window positioning, tray, startup — go through the
Rust layer via explicit commands (no arbitrary shell from the frontend).

## Security model

- The frontend cannot touch the filesystem directly; every operation is an
  explicit, named Tauri command.
- Folder selection uses the native picker; paths are validated as existing Git
  repositories before registration.
- Build/dev commands are user-configured and only ever executed on explicit
  button clicks (never automatically).
- Repositories are never copied or uploaded; configuration is local JSON.

## Roadmap

- GitHub / Docker / Supabase integrations, plugin system, global shortcuts
  (the event engine and tray architecture are designed for these).
- Network monitoring, battery status.
- Tauri v2 store plugin or SQLite migration for larger histories.

## Known limitations

- Dev-server detection is port-based (best effort); mixed-DPI multi-monitor
  dragging is approximated via per-window device pixel ratio.
- Taskbar avoidance uses per-monitor work areas from `GetMonitorInfoW`.