//! Several windows, one project each (like VS Code): opening windows, a saved session per
//! window so they all come back on launch, and sending files the OS opens (a
//! double-clicked `.tex`) to the window whose project holds them.

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

/// The label of the window from tauri.conf.json; windows opened later are `w-<n>`.
pub const MAIN: &str = "main";

/// How far a new window sits from the one it was opened from.
const CASCADE: f64 = 28.0;

#[derive(Default)]
pub struct Windows {
    /// Window label → its open folder, as its frontend last reported.
    projects: Mutex<HashMap<String, Option<String>>>,
    /// Files the OS asked to open before any window was listening.
    pending: Mutex<Vec<String>>,
    /// Set once a frontend has asked for pending files: from then on, files go out as events.
    listening: AtomicBool,
    /// Set when the app is quitting, so closing its windows keeps their sessions.
    quitting: AtomicBool,
    next: AtomicU64,
}

// ── Sessions ────────────────────────────────────────────────────────────────────────

/// `session.json`: `{"windows": {label: session}}`. A session is the frontend's own JSON
/// (open folder, tabs, active tab); this side only files it under its window.
fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config folder: {e}"))?;
    Ok(dir.join("session.json"))
}

/// The saved sessions by window label; None when nothing was ever saved (first launch).
/// Reads the single-window format (one session object) as the main window's.
fn load_sessions(path: &Path) -> Option<Map<String, Value>> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    match value {
        Value::Object(mut root) => match root.remove("windows") {
            Some(Value::Object(windows)) => Some(windows),
            _ => {
                let mut windows = Map::new();
                windows.insert(MAIN.into(), Value::Object(root));
                Some(windows)
            }
        },
        _ => None,
    }
}

fn save_sessions(path: &Path, windows: &Map<String, Value>) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't create {dir:?}: {e}"))?;
    }
    let text =
        serde_json::to_string_pretty(&json!({ "windows": windows })).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| format!("Couldn't save the session: {e}"))
}

/// A window with nothing open yet.
fn empty_session(project: Option<&str>) -> Value {
    json!({ "version": 1, "project": project, "tabs": [], "active": null })
}

/// When the main window was closed while others stayed open, the next launch would bring
/// up an empty main window beside them; instead, main takes over one of theirs.
fn adopt_into_main(windows: &mut Map<String, Value>) {
    if windows.contains_key(MAIN) {
        return;
    }
    if let Some(first) = windows.keys().min().cloned() {
        if let Some(session) = windows.remove(&first) {
            windows.insert(MAIN.into(), session);
        }
    }
}

/// This window's saved session, as JSON. None only on the very first launch (the app
/// shows its sample document then); a window with nothing saved gets an empty session.
#[tauri::command]
pub fn read_session(window: tauri::Window) -> Result<Option<String>, String> {
    let path = session_path(window.app_handle())?;
    let Some(windows) = load_sessions(&path) else {
        return Ok(None);
    };
    let session = windows
        .get(window.label())
        .cloned()
        .unwrap_or_else(|| empty_session(None));
    Ok(Some(session.to_string()))
}

#[tauri::command]
pub fn write_session(window: tauri::Window, contents: String) -> Result<(), String> {
    let session: Value =
        serde_json::from_str(&contents).map_err(|e| format!("Bad session: {e}"))?;
    let path = session_path(window.app_handle())?;
    let mut windows = load_sessions(&path).unwrap_or_default();
    windows.insert(window.label().to_string(), session);
    save_sessions(&path, &windows)
}

fn forget_session(app: &AppHandle, label: &str) {
    let Ok(path) = session_path(app) else { return };
    if let Some(mut windows) = load_sessions(&path) {
        if windows.remove(label).is_some() {
            let _ = save_sessions(&path, &windows);
        }
    }
}

// ── Windows ─────────────────────────────────────────────────────────────────────────

/// Opens a window like the main one, a little below and right of the focused window.
/// With `folder`, it opens on that folder.
#[tauri::command]
pub fn open_window(app: AppHandle, folder: Option<String>) -> Result<(), String> {
    let state = app.state::<Windows>();
    let label = format!(
        "w-{}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        state.next.fetch_add(1, Ordering::SeqCst)
    );
    let path = session_path(&app)?;
    let mut windows = load_sessions(&path).unwrap_or_default();
    windows.insert(label.clone(), empty_session(folder.as_deref()));
    save_sessions(&path, &windows)?;
    create_window(&app, &label).map(|_| ())
}

fn create_window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or("No window configuration")?;
    config.label = label.to_string();
    let mut builder =
        tauri::WebviewWindowBuilder::from_config(app, &config).map_err(|e| e.to_string())?;
    if let Some((x, y)) = cascade_from(app) {
        builder = builder.position(x, y);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    apply_glass(&window);
    Ok(window)
}

/// Where a new window goes: offset from the focused window (or any), in logical points.
fn cascade_from(app: &AppHandle) -> Option<(f64, f64)> {
    let windows = app.webview_windows();
    let from = windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.values().next())?;
    let scale = from.scale_factor().ok()?;
    let position = from.outer_position().ok()?.to_logical::<f64>(scale);
    Some((position.x + CASCADE, position.y + CASCADE))
}

/// The Terminal-style blur behind the transparent window (see `glass` in lib.rs).
pub fn apply_glass(_window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    if let Ok(ns_window) = _window.ns_window() {
        if !crate::glass::set_background_blur(ns_window, crate::WINDOW_BLUR_RADIUS) {
            eprintln!("pretty-latex: could not set the window blur; glass stays unblurred");
        }
    }
}

/// On launch: the windows open when the app last quit come back (main is already open).
pub fn restore_windows(app: &AppHandle) {
    let Ok(path) = session_path(app) else { return };
    let Some(mut windows) = load_sessions(&path) else {
        return;
    };
    let had_main = windows.contains_key(MAIN);
    adopt_into_main(&mut windows);
    if !had_main {
        let _ = save_sessions(&path, &windows);
    }
    let mut labels: Vec<String> = windows.keys().filter(|l| *l != MAIN).cloned().collect();
    labels.sort();
    for label in labels {
        if let Err(e) = create_window(app, &label) {
            eprintln!("pretty-latex: couldn't reopen window {label}: {e}");
        }
    }
}

/// The frontend reports its open folder: remembered for routing and opening, and shown as
/// the window title (Window menu, Mission Control).
#[tauri::command]
pub fn set_window_project(window: WebviewWindow, root: Option<String>) {
    let title = root
        .as_deref()
        .and_then(|r| Path::new(r).file_name())
        .map(|name| format!("{} — pretty-latex", name.to_string_lossy()))
        .unwrap_or_else(|| "pretty-latex".into());
    let _ = window.set_title(&title);
    window
        .app_handle()
        .state::<Windows>()
        .projects
        .lock()
        .unwrap()
        .insert(window.label().to_string(), root);
}

/// Brings forward another window that already has `root` open. False when none does.
#[tauri::command]
pub fn focus_project_window(window: WebviewWindow, root: String) -> bool {
    let app = window.app_handle();
    let owner = app
        .state::<Windows>()
        .projects
        .lock()
        .unwrap()
        .iter()
        .find(|(label, project)| *label != window.label() && project.as_deref() == Some(&root))
        .map(|(label, _)| label.clone());
    let Some(other) = owner.and_then(|label| app.get_webview_window(&label)) else {
        return false;
    };
    let _ = other.unminimize();
    let _ = other.set_focus();
    true
}

/// Files the OS asked to open before this window was listening (only at launch).
#[tauri::command]
pub fn take_pending_files(state: tauri::State<Windows>) -> Vec<String> {
    state.listening.store(true, Ordering::SeqCst);
    std::mem::take(&mut *state.pending.lock().unwrap())
}

// ── App events ──────────────────────────────────────────────────────────────────────

/// Which window opens `path`: the one whose project folder holds it (the deepest, if
/// projects nest), else the focused one, else main, else any.
fn route(
    path: &str,
    projects: &[(String, Option<String>)],
    focused: Option<&str>,
) -> Option<String> {
    let owner = projects
        .iter()
        .filter_map(|(label, root)| {
            let root = root.as_deref()?;
            let inside = path.strip_prefix(root)?.starts_with('/');
            inside.then_some((label, root.len()))
        })
        .max_by_key(|(_, len)| *len)
        .map(|(label, _)| label.clone());
    owner
        .or_else(|| focused.map(str::to_string))
        .or_else(|| {
            projects
                .iter()
                .find(|(l, _)| l == MAIN)
                .map(|(l, _)| l.clone())
        })
        .or_else(|| projects.first().map(|(l, _)| l.clone()))
}

/// macOS hands over double-clicked files (at launch and later).
pub fn on_opened(app: &AppHandle, paths: Vec<String>) {
    let state = app.state::<Windows>();
    if !state.listening.load(Ordering::SeqCst) {
        state.pending.lock().unwrap().extend(paths);
        return;
    }
    let windows = app.webview_windows();
    let projects: Vec<(String, Option<String>)> = {
        let known = state.projects.lock().unwrap();
        windows
            .keys()
            .map(|label| (label.clone(), known.get(label).cloned().flatten()))
            .collect()
    };
    let focused = windows
        .iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
        .map(|(label, _)| label.clone());
    let mut by_window: HashMap<String, Vec<String>> = HashMap::new();
    for path in paths {
        if let Some(label) = route(&path, &projects, focused.as_deref()) {
            by_window.entry(label).or_default().push(path);
        }
    }
    for (label, paths) in by_window {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.set_focus();
        }
        let _ = app.emit_to(label.as_str(), "open-files", paths);
    }
}

pub fn on_exit_requested(app: &AppHandle) {
    app.state::<Windows>()
        .quitting
        .store(true, Ordering::SeqCst);
}

/// A window closed: forget its session, unless the app is quitting (all windows come back
/// next time) or it was the last window (the app reopens on it).
pub fn on_window_destroyed(app: &AppHandle, label: &str) {
    let state = app.state::<Windows>();
    state.projects.lock().unwrap().remove(label);
    if state.quitting.load(Ordering::SeqCst) || app.webview_windows().is_empty() {
        return;
    }
    forget_session(app, label);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projects(list: &[(&str, Option<&str>)]) -> Vec<(String, Option<String>)> {
        list.iter()
            .map(|(l, r)| (l.to_string(), r.map(str::to_string)))
            .collect()
    }

    #[test]
    fn routes_a_file_to_the_window_with_its_project() {
        let open = projects(&[
            ("main", Some("/papers/thesis")),
            ("w-1", Some("/papers/talk")),
            ("w-2", None),
        ]);
        assert_eq!(
            route("/papers/talk/slides.tex", &open, Some("main")).as_deref(),
            Some("w-1")
        );
        assert_eq!(
            route("/papers/thesis/ch/one.tex", &open, Some("w-1")).as_deref(),
            Some("main")
        );
        // Not a prefix match on names: /papers/thesis2 isn't inside /papers/thesis.
        assert_eq!(
            route("/papers/thesis2/x.tex", &open, Some("w-2")).as_deref(),
            Some("w-2")
        );
        // Nobody has it: the focused window, else main.
        assert_eq!(route("/tmp/x.tex", &open, None).as_deref(), Some("main"));
    }

    #[test]
    fn prefers_the_deepest_project_when_folders_nest() {
        let open = projects(&[("main", Some("/papers")), ("w-1", Some("/papers/thesis"))]);
        assert_eq!(
            route("/papers/thesis/main.tex", &open, None).as_deref(),
            Some("w-1")
        );
    }

    #[test]
    fn reads_the_single_window_session_as_main() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.json");
        assert!(load_sessions(&path).is_none());
        std::fs::write(
            &path,
            r#"{"version":1,"project":"/p","tabs":[],"active":null}"#,
        )
        .unwrap();
        let windows = load_sessions(&path).unwrap();
        assert_eq!(windows[MAIN]["project"], "/p");
    }

    #[test]
    fn keeps_one_session_per_window() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.json");
        let mut windows = Map::new();
        windows.insert(MAIN.into(), empty_session(Some("/a")));
        windows.insert("w-1".into(), empty_session(Some("/b")));
        save_sessions(&path, &windows).unwrap();
        let back = load_sessions(&path).unwrap();
        assert_eq!(back["w-1"]["project"], "/b");
        assert_eq!(back[MAIN]["project"], "/a");
    }

    #[test]
    fn main_takes_over_a_window_when_it_was_closed() {
        let mut windows = Map::new();
        windows.insert("w-2".into(), empty_session(Some("/b")));
        windows.insert("w-1".into(), empty_session(Some("/a")));
        adopt_into_main(&mut windows);
        assert_eq!(windows[MAIN]["project"], "/a");
        assert_eq!(windows.len(), 2);
        assert!(!windows.contains_key("w-1"));
    }
}
