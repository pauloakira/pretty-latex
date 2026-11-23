//! Rust core of pretty-latex: the glass window, the file commands in `files`, the
//! latexmk build in `latex`, jumping between source and PDF in `synctex`, commit/push in
//! `git`, several windows in `windows` and asking about unsaved files on ⌘Q in `quit`.

mod files;
mod git;
mod latex;
mod quit;
mod synctex;
mod windows;

use tauri::Manager;

/// Blur radius (in points) behind the window, like Terminal's "Blur" slider. Small enough
/// that the wallpaper stays recognisable through the glass; the tint lives in CSS.
#[cfg(target_os = "macos")]
pub(crate) const WINDOW_BLUR_RADIUS: i32 = 24;

#[cfg(target_os = "macos")]
pub(crate) mod glass {
    use objc2::{msg_send, runtime::AnyObject};
    use std::ffi::c_void;

    // Private CoreGraphics (SkyLight) calls Terminal uses for its background blur. Not
    // App Store safe; we already opted out of the store with `macOSPrivateApi` (D1).
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSDefaultConnectionForThread() -> u32;
        fn CGSSetWindowBackgroundBlurRadius(connection: u32, window: u32, radius: i32) -> i32;
    }

    /// Blurs whatever is behind a transparent `NSWindow`, with a fixed radius.
    /// Returns false when the window pointer is missing or the call fails.
    pub fn set_background_blur(ns_window: *mut c_void, radius: i32) -> bool {
        if ns_window.is_null() {
            return false;
        }
        // SAFETY: `ns_window` is the live NSWindow Tauri gave us, used on the main thread
        // (from the setup hook); `windowNumber` takes no arguments and returns NSInteger.
        let number: isize = unsafe { msg_send![&*(ns_window as *mut AnyObject), windowNumber] };
        let Ok(number) = u32::try_from(number) else {
            return false;
        };
        // SAFETY: plain C calls with value arguments.
        unsafe {
            CGSSetWindowBackgroundBlurRadius(CGSDefaultConnectionForThread(), number, radius) == 0
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(windows::Windows::default())
        .manage(latex::Builds::default())
        .manage(quit::Quit::default())
        .menu(quit::menu)
        .on_menu_event(quit::on_menu_event)
        .invoke_handler(tauri::generate_handler![
            files::read_text_file,
            files::write_text_file,
            files::read_file_bytes,
            files::list_project,
            windows::read_session,
            windows::write_session,
            windows::open_window,
            windows::set_window_project,
            windows::focus_project_window,
            windows::take_pending_files,
            latex::build_latex,
            synctex::synctex_forward,
            synctex::synctex_inverse,
            git::git_status,
            git::git_commit,
            git::git_push,
            quit::set_window_unsaved,
            quit::continue_quit,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window(windows::MAIN) {
                windows::apply_glass(&window);
            }
            windows::restore_windows(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building pretty-latex")
        .run(|app, event| match event {
            // macOS hands over double-clicked files with this event, at launch and later.
            tauri::RunEvent::Opened { urls } => {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect();
                if !paths.is_empty() {
                    windows::on_opened(app, paths);
                }
            }
            tauri::RunEvent::ExitRequested { .. } => windows::on_exit_requested(app),
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Destroyed,
                ..
            } => {
                quit::forget(app, &label);
                windows::on_window_destroyed(app, &label);
            }
            _ => {}
        });
}
