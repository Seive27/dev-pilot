use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Emitter};

use crate::models::{
    DevPilotEvent, Project, EVENT_BUILD_FAILED, EVENT_BUILD_STARTED, EVENT_BUILD_SUCCESS,
    EVENT_CI_FAILED, EVENT_DEV_SERVER_CRASHED, EVENT_DEV_SERVER_STARTED,
    EVENT_DEV_SERVER_STOPPED, EVENT_FETCH_COMPLETED, EVENT_GIT_ACTION_FAILED,
    EVENT_GIT_ACTION_STARTED, EVENT_PULL_COMPLETED, EVENT_PULL_REQUEST_APPROVED,
    EVENT_PULL_REQUEST_OPENED, EVENT_PUSH_COMPLETED, EVENT_REMOTE_BRANCH_CHANGED,
    EVENT_REMOTE_COMMIT, EVENT_REMOTE_UNAVAILABLE, EVENT_REPOSITORY_RESTORED,
    EVENT_REPOSITORY_UNAVAILABLE, EVENT_REVIEW_REQUESTED,
};
use crate::persistence;

static COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn now_iso() -> String {
    chrono::Local::now().to_rfc3339()
}

fn event_id() -> String {
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("evt-{}-{:x}", std::process::id(), n)
}

/// Persist an event to the timeline and emit it to every open window.
pub fn emit(
    app: &AppHandle,
    project: Option<&Project>,
    etype: &str,
    severity: &str,
    title: impl Into<String>,
    description: Option<String>,
    metadata: Option<serde_json::Value>,
) {
    let event = DevPilotEvent {
        id: event_id(),
        project_id: project.map(|p| p.id.clone()),
        project_name: project.map(|p| p.name.clone()),
        r#type: etype.to_string(),
        severity: severity.to_string(),
        title: title.into(),
        description,
        timestamp: now_iso(),
        metadata,
    };
    persistence::append_event(app, &event);
    let _ = app.emit("devpilot:event", &event);
}

// ---- convenience constructors ---------------------------------------------

pub fn build_started(app: &AppHandle, project: &Project, command: &str) {
    emit(
        app,
        Some(project),
        EVENT_BUILD_STARTED,
        "low",
        "Build started",
        Some(command.to_string()),
        None,
    );
}

pub fn build_success(app: &AppHandle, project: &Project, duration_ms: u64) {
    emit(
        app,
        Some(project),
        EVENT_BUILD_SUCCESS,
        "high",
        "Build successful",
        Some(format!("Completed in {:.1}s", duration_ms as f64 / 1000.0)),
        None,
    );
}

pub fn build_failed(app: &AppHandle, project: &Project, exit_code: i32, tail: &str) {
    emit(
        app,
        Some(project),
        EVENT_BUILD_FAILED,
        "critical",
        "Build failed",
        Some(format!("Exit code {exit_code}")),
        Some(serde_json::json!({ "log": tail })),
    );
}

pub fn dev_server_started(app: &AppHandle, project: &Project, port: Option<u16>) {
    emit(
        app,
        Some(project),
        EVENT_DEV_SERVER_STARTED,
        "medium",
        "Dev server started",
        port.map(|p| format!("Listening on port {p}")),
        None,
    );
}

pub fn dev_server_stopped(app: &AppHandle, project: &Project) {
    emit(
        app,
        Some(project),
        EVENT_DEV_SERVER_STOPPED,
        "medium",
        "Dev server stopped",
        None,
        None,
    );
}

pub fn dev_server_crashed(app: &AppHandle, project: &Project) {
    emit(
        app,
        Some(project),
        EVENT_DEV_SERVER_CRASHED,
        "critical",
        "Dev server crashed",
        None,
        None,
    );
}

pub fn repo_unavailable(app: &AppHandle, project: &Project) {
    emit(
        app,
        Some(project),
        EVENT_REPOSITORY_UNAVAILABLE,
        "critical",
        "Repository unavailable",
        Some(project.path.clone()),
        None,
    );
}

pub fn repo_restored(app: &AppHandle, project: &Project) {
    emit(
        app,
        Some(project),
        EVENT_REPOSITORY_RESTORED,
        "medium",
        "Repository available again",
        None,
        None,
    );
}

pub fn git_action_started(app: &AppHandle, project: &Project, action: &str) {
    emit(
        app,
        Some(project),
        EVENT_GIT_ACTION_STARTED,
        "low",
        format!("{action} started"),
        None,
        None,
    );
}

pub fn git_action_done(
    app: &AppHandle,
    project: &Project,
    action: &str,
    success: bool,
    detail: Option<String>,
) {
    if success {
        let (etype, title, severity) = match action {
            "push" => (EVENT_PUSH_COMPLETED, "Pushed changes successfully", "high"),
            "pull" => (EVENT_PULL_COMPLETED, "Pull completed", "medium"),
            _ => (EVENT_FETCH_COMPLETED, "Fetch completed", "low"),
        };
        emit(
            app,
            Some(project),
            etype,
            severity,
            title,
            detail,
            None,
        );
    } else {
        emit(
            app,
            Some(project),
            EVENT_GIT_ACTION_FAILED,
            "high",
            format!("{action} failed"),
            detail,
            None,
        );
    }
}

pub fn remote_commits_detected(
    app: &AppHandle,
    project: &Project,
    branch: &str,
    author: &str,
    count: usize,
    latest_subject: &str,
    commits: Vec<crate::models::CommitInfo>,
) {
    let title = if count == 1 {
        format!("New commit on {branch}")
    } else {
        format!("{count} new commits on {branch}")
    };
    let desc = if author.is_empty() {
        format!("Latest: {latest_subject}")
    } else {
        format!("by {author} · Latest: {latest_subject}")
    };
    emit(
        app,
        Some(project),
        EVENT_REMOTE_COMMIT,
        "high",
        title,
        Some(desc),
        Some(serde_json::json!({
            "branch": branch,
            "author": author,
            "commitCount": count,
            "latestCommit": latest_subject,
            "commits": commits,
            "source": "remote"
        })),
    );
}

pub fn remote_branch_changed(app: &AppHandle, project: &Project, branch: &str, detail: &str) {
    emit(
        app,
        Some(project),
        EVENT_REMOTE_BRANCH_CHANGED,
        "high",
        format!("Remote branch {branch} updated"),
        Some(detail.to_string()),
        Some(serde_json::json!({ "branch": branch })),
    );
}

#[allow(dead_code)]
pub fn pull_request_event(
    app: &AppHandle,
    project: &Project,
    etype: &str,
    title: &str,
    pr_number: u64,
    pr_title: &str,
    author: &str,
    url: &str,
) {
    let event_type = match etype {
        "review_requested" => EVENT_REVIEW_REQUESTED,
        "approved" => EVENT_PULL_REQUEST_APPROVED,
        _ => EVENT_PULL_REQUEST_OPENED,
    };
    emit(
        app,
        Some(project),
        event_type,
        "medium",
        title.to_string(),
        Some(format!("#{pr_number} {pr_title} by {author}")),
        Some(serde_json::json!({
            "prNumber": pr_number,
            "prTitle": pr_title,
            "author": author,
            "url": url,
            "source": "github"
        })),
    );
}

#[allow(dead_code)]
pub fn ci_failed(
    app: &AppHandle,
    project: &Project,
    workflow_name: &str,
    branch: &str,
    details_url: &str,
) {
    emit(
        app,
        Some(project),
        EVENT_CI_FAILED,
        "critical",
        format!("CI build failed: {workflow_name}"),
        Some(format!("on branch {branch}")),
        Some(serde_json::json!({
            "workflow": workflow_name,
            "branch": branch,
            "url": details_url,
            "source": "github"
        })),
    );
}

pub fn remote_unavailable(app: &AppHandle, project: &Project, reason: &str) {
    emit(
        app,
        Some(project),
        EVENT_REMOTE_UNAVAILABLE,
        "medium",
        "Remote monitoring unavailable",
        Some(reason.to_string()),
        None,
    );
}