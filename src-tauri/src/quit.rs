//! Quitting with unsaved changes. tao lets AppKit's standard Quit item end the app with no
//! event to catch, so the app menu gets its own Quit (⌘Q) instead. It asks each window
//! that has unsaved files, one at a time: that window shows Save / Don't Save / Cancel,
//! then calls `continue_quit` to move on, or stays put to cancel the quit.
//!
//! Closing a single window is handled in the webview (`onCloseRequested`).

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuEvent, MenuItem, MenuItemKind};
use tauri::{AppHandle, Emitter, Manager, Wry};

/// The id of our Quit menu item.
const QUIT_ID: &str = "quit";

#[derive(Default)]
pub struct Quit {
    /// Window label → how many open files have unsaved changes, as its frontend reported.
    unsaved: Mutex<HashMap<String, usize>>,
    /// Windows that answered during the current quit (saved, or chose Don't Save).
    approved: Mutex<HashSet<String>>,
}

/// The default menu, with AppKit's Quit swapped for one that asks first.
pub fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(app)?;
    // The app menu (named after the app) comes first on macOS.
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        for item in app_menu.items()? {
            if let MenuItemKind::Predefined(predefined) = &item {
                if predefined.text()?.starts_with("Quit") {
                    app_menu.remove(predefined)?;
                }
            }
        }
        let name = &app.package_info().name;
        let quit = MenuItem::with_id(
            app,
            QUIT_ID,
            format!("Quit {name}"),
            true,
            Some("CmdOrCtrl+Q"),
        )?;
        app_menu.append(&quit)?;
    }
    Ok(menu)
}

pub fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    if event.id() == QUIT_ID {
        app.state::<Quit>().approved.lock().unwrap().clear();
        advance(app);
    }
}

/// How many unsaved files this window has; it reports every change.
#[tauri::command]
pub fn set_window_unsaved(window: tauri::Window, state: tauri::State<Quit>, count: usize) {
    state
        .unsaved
        .lock()
        .unwrap()
        .insert(window.label().to_string(), count);
}

/// This window has dealt with its unsaved files: ask the next one, or quit.
#[tauri::command]
pub fn continue_quit(window: tauri::Window, app: AppHandle) {
    app.state::<Quit>()
        .approved
        .lock()
        .unwrap()
        .insert(window.label().to_string());
    advance(&app);
}

pub fn forget(app: &AppHandle, label: &str) {
    let state = app.state::<Quit>();
    state.unsaved.lock().unwrap().remove(label);
    state.approved.lock().unwrap().remove(label);
}

fn advance(app: &AppHandle) {
    let state = app.state::<Quit>();
    let open: Vec<String> = app.webview_windows().into_keys().collect();
    let focused = app
        .webview_windows()
        .into_iter()
        .find(|(_, w)| w.is_focused().unwrap_or(false))
        .map(|(label, _)| label);
    let next = next_to_ask(
        &state.unsaved.lock().unwrap(),
        &state.approved.lock().unwrap(),
        &open,
        focused.as_deref(),
    );
    match next {
        Some(label) => {
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = app.emit_to(label.as_str(), "quit-requested", ());
        }
        None => app.exit(0),
    }
}

/// The next open window with unsaved files that hasn't answered yet: the focused one
/// first, then the rest in label order.
fn next_to_ask(
    unsaved: &HashMap<String, usize>,
    approved: &HashSet<String>,
    open: &[String],
    focused: Option<&str>,
) -> Option<String> {
    let mut labels: Vec<&String> = open
        .iter()
        .filter(|label| unsaved.get(*label).copied().unwrap_or(0) > 0 && !approved.contains(*label))
        .collect();
    labels.sort_by_key(|label| (Some(label.as_str()) != focused, label.as_str()));
    labels.first().map(|label| label.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn quits_when_nothing_is_unsaved() {
        let unsaved = HashMap::from([("main".to_string(), 0)]);
        assert_eq!(
            next_to_ask(&unsaved, &HashSet::new(), &strings(&["main", "w-1"]), None),
            None
        );
    }

    #[test]
    fn asks_the_focused_window_first_then_the_others() {
        let unsaved = HashMap::from([("main".to_string(), 2), ("w-1".to_string(), 1)]);
        let open = strings(&["main", "w-1"]);
        assert_eq!(
            next_to_ask(&unsaved, &HashSet::new(), &open, Some("w-1")).as_deref(),
            Some("w-1")
        );
        let approved = HashSet::from(["w-1".to_string()]);
        assert_eq!(
            next_to_ask(&unsaved, &approved, &open, Some("w-1")).as_deref(),
            Some("main")
        );
    }

    #[test]
    fn skips_windows_that_answered_or_are_gone() {
        let unsaved = HashMap::from([("main".to_string(), 1), ("w-2".to_string(), 3)]);
        let approved = HashSet::from(["main".to_string()]);
        // w-2 closed since it last reported.
        assert_eq!(
            next_to_ask(&unsaved, &approved, &strings(&["main"]), None),
            None
        );
    }
}
