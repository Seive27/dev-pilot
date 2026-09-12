use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};

use crate::events;
use crate::git;
use crate::models::{
    EVENT_BRANCH_CHANGED, EVENT_COMMIT_CREATED, EVENT_FILE_CHANGED, EVENT_MERGE_CONFLICT,
    EVENT_REBASE_STARTED, EVENT_STASH_UPDATED, EVENT_SYNC_CHANGED,
};
use crate::persistence;
use crate::state::AppState;

fn changed_paths(prev: &crate::models::RepoSnapshot, next: &crate::models::RepoSnapshot) -> HashSet<String> {
    let a: HashSet<String> = prev.files.iter().map(|f| format!("{} {}", f.status, f.path)).collect();
    let b: HashSet<String> = next.files.iter().map(|f| format!("{} {}", f.status, f.path)).collect();
    a.symmetric_difference(&b).cloned().collect()
}

pub fn start(app: &AppHandle) {
    let handle = app.clone();
    // Local monitoring thread
    let local_handle = handle.clone();
    std::thread::spawn(move || loop {
        let settings = persistence::load_settings(&local_handle);
        let interval = settings.polling_interval.max(1);
        let enabled = settings.monitoring_enabled;

        if enabled {
            let projects = persistence::load_projects(&local_handle);
            let state = local_handle.state::<AppState>();
            let mut unavailable = state.unavailable.lock().unwrap();

            for p in projects.iter().filter(|p| p.monitoring) {
                let path = Path::new(&p.path);
                if !path.exists() {
                    if !unavailable.contains(&p.id) {
                        events::repo_unavailable(&local_handle, p);
                        unavailable.insert(p.id.clone());
                    }
                    let snap = crate::models::RepoSnapshot::failed(
                        &p.id,
                        "repository path does not exist".to_string(),
                    );
                    state.snapshots.lock().unwrap().insert(p.id.clone(), snap);
                    continue;
                }

                // Path is back — report restoration once.
                if unavailable.remove(&p.id) {
                    events::repo_restored(&local_handle, p);
                }

                let snap = git::read_snapshot(path, &p.id);
                let prev = state.snapshots.lock().unwrap().get(&p.id).cloned();

                if let (Some(prev), true) = (prev, snap.ok) {
                    if prev.ok {
                        if prev.head != snap.head && snap.head.is_some() {
                            if let Some(c) = snap.commits.first() {
                                events::emit(
                                    &local_handle,
                                    Some(p),
                                    EVENT_COMMIT_CREATED,
                                    "medium",
                                    "Commit created",
                                    Some(c.subject.clone()),
                                    None,
                                );
                            }
                        }
                        if prev.branch != snap.branch {
                            let desc = snap
                                .branch
                                .clone()
                                .map(|b| format!("Now on {b}"))
                                .unwrap_or_else(|| "Detached HEAD".to_string());
                            events::emit(
                                &local_handle,
                                Some(p),
                                EVENT_BRANCH_CHANGED,
                                "medium",
                                "Branch changed",
                                Some(desc),
                                None,
                            );
                        }
                        if snap.conflict_count > 0 && prev.conflict_count == 0 {
                            events::emit(
                                &local_handle,
                                Some(p),
                                EVENT_MERGE_CONFLICT,
                                "critical",
                                "Merge conflicts detected",
                                Some(format!("{} conflicting files", snap.conflict_count)),
                                None,
                            );
                        }
                        let changed = changed_paths(&prev, &snap);
                        if !changed.is_empty() {
                            events::emit(
                                &local_handle,
                                Some(p),
                                EVENT_FILE_CHANGED,
                                "low",
                                "Files changed",
                                Some(format!(
                                    "{} modified · {} staged · {} untracked",
                                    snap.modified_count, snap.staged_count, snap.untracked_count
                                )),
                                None,
                            );
                        }
                        if prev.stash_count != snap.stash_count {
                            events::emit(
                                &local_handle,
                                Some(p),
                                EVENT_STASH_UPDATED,
                                "low",
                                "Stash updated",
                                Some(format!("{} stashes", snap.stash_count)),
                                None,
                            );
                        }
                        if !prev.rebasing && snap.rebasing {
                            events::emit(
                                &local_handle,
                                Some(p),
                                EVENT_REBASE_STARTED,
                                "medium",
                                "Rebase in progress",
                                None,
                                None,
                            );
                        }
                        if (prev.ahead != snap.ahead || prev.behind != snap.behind)
                            && (snap.ahead != 0 || snap.behind != 0)
                        {
                            events::emit(
                                &local_handle,
                                Some(p),
                                EVENT_SYNC_CHANGED,
                                "low",
                                "Sync state changed",
                                Some(format!("ahead {} · behind {}", snap.ahead, snap.behind)),
                                None,
                            );
                        }
                    }
                } else if snap.ok {
                    // First snapshot for this project — quiet.
                }

                state.snapshots.lock().unwrap().insert(p.id.clone(), snap);
            }
        }

        // While monitoring is off, poll the setting cheaply so turning it back
        // on resumes promptly without a long idle wait.
        let sleep_for = if enabled { interval } else { 1 };
        std::thread::sleep(Duration::from_secs(sleep_for));
    });

    // Remote monitoring thread
    let remote_handle = handle.clone();
    std::thread::spawn(move || {
        // Load persisted remote heads from disk on startup
        let saved_heads: Option<HashMap<String, String>> = persistence::load_remote_state(&remote_handle);
        if let Some(heads) = saved_heads {
            let state = remote_handle.state::<AppState>();
            *state.last_remote_heads.lock().unwrap() = heads;
        }

        // Keep track of unavailable remote warnings so we don't spam
        let mut warned_remote_unavailable: HashSet<String> = HashSet::new();
        let mut last_run = Instant::now() - Duration::from_secs(3600); // Trigger promptly on start

        loop {
            let settings = persistence::load_settings(&remote_handle);
            let interval = settings.remote_polling_interval.max(10);
            let enabled = settings.monitoring_enabled && settings.remote_monitoring_enabled;

            if enabled && last_run.elapsed() >= Duration::from_secs(interval) {
                last_run = Instant::now();
                let projects = persistence::load_projects(&remote_handle);

                for p in projects.iter().filter(|p| p.monitoring) {
                    let path = Path::new(&p.path);
                    if !path.exists() {
                        continue;
                    }

                    // Check remotes
                    let snap = git::read_snapshot(path, &p.id);
                    if snap.remotes.is_empty() {
                        continue;
                    }

                    let primary_remote = &snap.remotes[0];
                    let provider = git::detect_remote_provider(primary_remote);
                    let _ = &provider;

                    // Perform safe git fetch --prune
                    let fetch_ok = git::fetch_remote(path);
                    if let Err(e) = fetch_ok {
                        if !warned_remote_unavailable.contains(&p.id) {
                            events::remote_unavailable(&remote_handle, p, &format!("Fetch failed: {e}"));
                            warned_remote_unavailable.insert(p.id.clone());
                        }
                        continue;
                    } else {
                        warned_remote_unavailable.remove(&p.id);
                    }

                    // Remote monitoring of branches
                    let current_branch = snap.branch.as_deref().unwrap_or("main");
                    let remote_ref = snap.upstream.as_deref().unwrap_or_else(|| {
                        if current_branch.starts_with("origin/") {
                            current_branch
                        } else {
                            // default to origin/<current_branch>
                            ""
                        }
                    });
                    let target_ref = if remote_ref.is_empty() {
                        format!("origin/{current_branch}")
                    } else {
                        remote_ref.to_string()
                    };

                    if let Some(new_head) = git::get_remote_branch_head(path, &target_ref) {
                        let cache_key = format!("{}:{}", p.id, target_ref);
                        let state = remote_handle.state::<AppState>();
                        let prev_head = state.last_remote_heads.lock().unwrap().get(&cache_key).cloned();

                        match prev_head {
                            Some(ref old_head) if old_head != &new_head => {
                                // New commits detected on remote branch!
                                // Get commits between old_head..new_head
                                let range = format!("{old_head}..{new_head}");
                                let new_commits = git::get_commits_between(path, &range, 20);

                                if !new_commits.is_empty() {
                                    let count = new_commits.len();
                                    let latest = &new_commits[0];
                                    let author = &latest.author;
                                    let subject = &latest.subject;

                                    if settings.notify_on_remote_commits {
                                        events::remote_commits_detected(
                                            &remote_handle,
                                            p,
                                            &target_ref,
                                            author,
                                            count,
                                            subject,
                                            new_commits.clone(),
                                        );
                                    }
                                } else {
                                    // Range query might be empty if branch was force-pushed or non-fast-forward
                                    if settings.notify_on_remote_commits {
                                        events::remote_branch_changed(
                                            &remote_handle,
                                            p,
                                            &target_ref,
                                            &format!("HEAD changed to {}", &new_head[..7.min(new_head.len())]),
                                        );
                                    }
                                }

                                state.last_remote_heads.lock().unwrap().insert(cache_key.clone(), new_head.clone());
                                // Persist remote heads
                                let heads_map = state.last_remote_heads.lock().unwrap().clone();
                                persistence::save_remote_state(&remote_handle, &heads_map);
                            }
                            None => {
                                // First time seeing this remote branch head — record without spamming
                                state.last_remote_heads.lock().unwrap().insert(cache_key.clone(), new_head.clone());
                                let heads_map = state.last_remote_heads.lock().unwrap().clone();
                                persistence::save_remote_state(&remote_handle, &heads_map);
                            }
                            _ => {
                                // Head unchanged
                            }
                        }
                    }

                    // Update snapshot with latest remote information in background
                    let updated_snap = git::read_snapshot(path, &p.id);
                    let state = remote_handle.state::<AppState>();
                    state.snapshots.lock().unwrap().insert(p.id.clone(), updated_snap.clone());
                    let _ = remote_handle.emit("devpilot:snapshot-updated", &updated_snap);
                }
            }

            // Sleep 2s before re-checking time/setting
            std::thread::sleep(Duration::from_secs(2));
        }
    });
}