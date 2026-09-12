use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

use serde::{Deserialize, Serialize};

use crate::events::now_iso;
use crate::models::{CommitInfo, RepoFile, RepoSnapshot};

#[allow(dead_code)]
pub struct CmdOut {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_git(dir: &Path, args: &[&str]) -> Result<CmdOut, String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(dir)
        .arg("-c")
        .arg("core.quotepath=false")
        .args(args);

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let out = cmd
        .output()
        .map_err(|e| format!("failed to run git: {e}"))?;
    Ok(CmdOut {
        code: out.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

pub fn is_git_repo(dir: &Path) -> bool {
    if dir.join(".git").exists() {
        return true;
    }
    match run_git(dir, &["rev-parse", "--is-inside-work-tree"]) {
        Ok(out) => out.code == 0 && out.stdout.trim() == "true",
        Err(_) => false,
    }
}

fn git_dir(dir: &Path) -> Option<PathBuf> {
    match run_git(dir, &["rev-parse", "--git-dir"]) {
        Ok(out) if out.code == 0 => {
            let g = out.stdout.trim();
            let p = if Path::new(g).is_absolute() {
                PathBuf::from(g)
            } else {
                dir.join(g)
            };
            Some(p)
        }
        _ => None,
    }
}

/// `git status --porcelain=v1 -b` -> (branch, upstream, ahead, behind, detached, files)
fn parse_status(stdout: &str) -> (Option<String>, Option<String>, i32, i32, bool, Vec<RepoFile>) {
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;
    let mut detached = false;
    let mut files = Vec::new();

    for line in stdout.lines() {
        if let Some(meta) = line.strip_prefix("## ") {
            let rest = meta;
            // "main...origin/main [ahead 1, behind 2]" | "HEAD (no branch)" | "main"
            if let Some(up) = rest.find("...") {
                branch = Some(rest[..up].to_string());
                let after = &rest[up + 3..];
                let (up_name, extra) = match after.find(' ') {
                    Some(i) => (&after[..i], &after[i + 1..]),
                    None => (after, ""),
                };
                upstream = Some(up_name.trim().to_string());
                if extra.starts_with('[') {
                    for part in extra.trim_matches(|c| c == '[' || c == ']').split(',') {
                        let p = part.trim();
                        if let Some(n) = p.strip_prefix("ahead ") {
                            ahead = n.trim().parse().unwrap_or(0);
                        } else if let Some(n) = p.strip_prefix("behind ") {
                            behind = n.trim().parse().unwrap_or(0);
                        }
                    }
                }
            } else if rest.contains("(no branch)") {
                branch = None;
                detached = true;
            } else {
                branch = Some(rest.to_string());
            }
            continue;
        }
        if line.len() >= 3 && line.as_bytes()[2] == b' ' {
            let status = line[..2].to_string();
            let path = line[3..].to_string();
            files.push(RepoFile { status, path });
        } else if line.len() == 2 {
            let status = line.to_string();
            let path = String::new();
            files.push(RepoFile { status, path });
        }
    }

    (branch, upstream, ahead, behind, detached, files)
}

fn is_conflict(status: &str) -> bool {
    status.chars().any(|c| c == 'U')
        || matches!(status, "AA" | "DD" | "AU" | "UA" | "DU" | "UD")
}

fn is_staged(status: &str) -> bool {
    let c = status.chars().next().unwrap_or(' ');
    matches!(c, 'M' | 'A' | 'D' | 'R' | 'C')
}

fn is_modified(status: &str) -> bool {
    status.contains('M') || status.contains('D') || status.contains('R')
}

pub fn read_snapshot(dir: &Path, project_id: &str) -> RepoSnapshot {
    let mut snap = RepoSnapshot::failed(
        project_id,
        "not a git repository or git is unavailable".to_string(),
    );

    if !dir.exists() {
        snap.error = Some("repository path does not exist".to_string());
        return snap;
    }

    let status = match run_git(dir, &["status", "--porcelain=v1", "-b"]) {
        Ok(o) if o.code == 0 => o,
        Ok(_) => {
            snap.error = Some("not a git repository".to_string());
            return snap;
        }
        Err(e) => {
            snap.error = Some(e);
            return snap;
        }
    };

    let (branch, upstream, ahead, behind, detached, files) = parse_status(&status.stdout);

    let head = match run_git(dir, &["rev-parse", "HEAD"]) {
        Ok(o) if o.code == 0 => Some(o.stdout.trim().to_string()),
        _ => None,
    };

    // Recent commits (may be empty on a fresh repository).
    let mut commits = Vec::new();
    if head.is_some() {
        if let Ok(o) = run_git(
            dir,
            &["log", "-n", "8", "--pretty=format:%H%x1f%s%x1f%an%x1f%aI"],
        ) {
            if o.code == 0 {
                for line in o.stdout.lines() {
                    let mut parts = line.split('\u{1f}');
                    let hash = parts.next().unwrap_or("").to_string();
                    let subject = parts.next().unwrap_or("").to_string();
                    let author = parts.next().unwrap_or("").to_string();
                    let iso = parts.next().unwrap_or("").to_string();
                    if !hash.is_empty() {
                        commits.push(CommitInfo { hash, subject, author, iso });
                    }
                }
            }
        }
    }

    let stash_count = run_git(dir, &["stash", "list"])
        .map(|o| o.stdout.lines().count())
        .unwrap_or(0);

    let remotes = match run_git(dir, &["remote", "-v"]) {
        Ok(o) => o
            .stdout
            .lines()
            .filter(|l| l.contains("(fetch)"))
            .filter_map(|l| {
                let mut parts = l.split_whitespace();
                let _name = parts.next()?;
                let url = parts.next()?;
                Some(url.to_string())
            })
            .collect(),
        Err(_) => Vec::new(),
    };

    let rebasing = git_dir(dir)
        .map(|gd| {
            gd.join("rebase-merge").exists() || gd.join("rebase-apply").exists()
        })
        .unwrap_or(false);

    let stack = detect_stack(dir);

    let modified_count = files.iter().filter(|f| is_modified(&f.status)).count();
    let staged_count = files.iter().filter(|f| is_staged(&f.status)).count();
    let untracked_count = files.iter().filter(|f| f.status == "??").count();
    let conflict_count = files.iter().filter(|f| is_conflict(&f.status)).count();

    snap.ok = true;
    snap.error = None;
    snap.branch = branch;
    snap.upstream = upstream;
    snap.ahead = ahead;
    snap.behind = behind;
    snap.detached = detached;
    snap.head = head;
    snap.files = files;
    snap.modified_count = modified_count;
    snap.staged_count = staged_count;
    snap.untracked_count = untracked_count;
    snap.conflict_count = conflict_count;
    snap.stash_count = stash_count;
    snap.rebasing = rebasing;
    snap.commits = commits;
    snap.remotes = remotes;
    snap.stack = stack;
    snap.checked_at = now_iso();
    snap
}

/// Detect the technology stack by inspecting a handful of well-known files.
pub fn detect_stack(dir: &Path) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    let push = |t: &str, tags: &mut Vec<String>| {
        if !tags.iter().any(|x| x == t) {
            tags.push(t.to_string());
        }
    };

    let pkg = dir.join("package.json");
    if pkg.exists() {
        if let Ok(text) = std::fs::read_to_string(&pkg) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                let mut keys: Vec<String> = Vec::new();
                for section in ["dependencies", "devDependencies"] {
                    if let Some(deps) = v.get(section).and_then(|d| d.as_object()) {
                        keys.extend(deps.keys().cloned());
                    }
                }
                let all = keys.join(" ");
                if all.contains("react") && !all.contains("react-native") {
                    push("React", &mut tags);
                }
                if all.contains("next") {
                    push("Next.js", &mut tags);
                }
                if all.contains("react-native") || all.contains("expo") {
                    push("React Native", &mut tags);
                    if all.contains("expo") {
                        push("Expo", &mut tags);
                    }
                }
                if all.contains("vite") {
                    push("Vite", &mut tags);
                }
                if all.contains("vue") {
                    push("Vue", &mut tags);
                }
                if all.contains("svelte") {
                    push("Svelte", &mut tags);
                }
                if all.contains("tailwindcss") {
                    push("Tailwind CSS", &mut tags);
                }
                if all.contains("typescript") {
                    push("TypeScript", &mut tags);
                }
                if all.contains("supabase") {
                    push("Supabase", &mut tags);
                }
                if all.contains("@tauri-apps") {
                    push("Tauri", &mut tags);
                }
            }
        }
    }

    if dir.join("Cargo.toml").exists() {
        if let Ok(text) = std::fs::read_to_string(dir.join("Cargo.toml")) {
            push("Rust", &mut tags);
            if text.contains("tauri") {
                push("Tauri", &mut tags);
            }
        }
    }

    if dir.join("pyproject.toml").exists() || dir.join("requirements.txt").exists() {
        push("Python", &mut tags);
    }
    if dir.join("go.mod").exists() {
        push("Go", &mut tags);
    }
    if dir.join("Dockerfile").exists() {
        push("Docker", &mut tags);
    }
    if dir.join(".csproj").exists() {
        push(".NET", &mut tags);
    }
    if dir.join("composer.json").exists() {
        push("PHP", &mut tags);
    }

    tags.truncate(8);
    tags
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteProviderInfo {
    pub provider: String, // "github", "gitlab", "bitbucket", "other"
    pub owner: Option<String>,
    pub repo: Option<String>,
    pub url: String,
    pub is_supported: bool,
}

pub fn detect_remote_provider(remote_url: &str) -> RemoteProviderInfo {
    let clean = remote_url.trim();
    if clean.contains("github.com") {
        // e.g. git@github.com:owner/repo.git or https://github.com/owner/repo.git
        let path_part = if let Some(p) = clean.split("github.com/").nth(1) {
            p
        } else if let Some(p) = clean.split("github.com:").nth(1) {
            p
        } else {
            ""
        };
        let trimmed = path_part.trim_end_matches(".git").trim_matches('/');
        let mut segs = trimmed.split('/');
        let owner = segs.next().map(|s| s.to_string());
        let repo = segs.next().map(|s| s.to_string());
        RemoteProviderInfo {
            provider: "github".to_string(),
            owner,
            repo,
            url: clean.to_string(),
            is_supported: true,
        }
    } else if clean.contains("gitlab.com") {
        RemoteProviderInfo {
            provider: "gitlab".to_string(),
            owner: None,
            repo: None,
            url: clean.to_string(),
            is_supported: false,
        }
    } else if clean.contains("bitbucket.org") {
        RemoteProviderInfo {
            provider: "bitbucket".to_string(),
            owner: None,
            repo: None,
            url: clean.to_string(),
            is_supported: false,
        }
    } else {
        RemoteProviderInfo {
            provider: "other".to_string(),
            owner: None,
            repo: None,
            url: clean.to_string(),
            is_supported: false,
        }
    }
}

/// Fetch remote refs safely (`git fetch --prune`) without touching the working tree.
pub fn fetch_remote(dir: &Path) -> Result<bool, String> {
    let out = run_git(dir, &["fetch", "--prune"])?;
    Ok(out.code == 0)
}

/// Get the tip commit hash for a remote tracking branch (e.g. "origin/main").
pub fn get_remote_branch_head(dir: &Path, branch: &str) -> Option<String> {
    let target = if branch.contains('/') {
        branch.to_string()
    } else {
        format!("origin/{branch}")
    };
    match run_git(dir, &["rev-parse", &target]) {
        Ok(o) if o.code == 0 => {
            let hash = o.stdout.trim().to_string();
            if !hash.is_empty() {
                Some(hash)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Get list of commits between `from_hash..to_hash` or on `upstream` not in local branch.
pub fn get_commits_between(dir: &Path, range: &str, limit: usize) -> Vec<CommitInfo> {
    let lim_str = limit.to_string();
    let mut commits = Vec::new();
    if let Ok(o) = run_git(
        dir,
        &[
            "log",
            "-n",
            &lim_str,
            "--pretty=format:%H%x1f%s%x1f%an%x1f%aI",
            range,
        ],
    ) {
        if o.code == 0 {
            for line in o.stdout.lines() {
                let mut parts = line.split('\u{1f}');
                let hash = parts.next().unwrap_or("").to_string();
                let subject = parts.next().unwrap_or("").to_string();
                let author = parts.next().unwrap_or("").to_string();
                let iso = parts.next().unwrap_or("").to_string();
                if !hash.is_empty() {
                    commits.push(CommitInfo {
                        hash,
                        subject,
                        author,
                        iso,
                    });
                }
            }
        }
    }
    commits
}