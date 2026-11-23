//! Rust core of pretty-latex: the glass window, the file commands in `files` and the
//! latexmk build in `latex`. SyncTeX lands here in a later card.

mod files;
mod latex;

use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Files the OS asked us to open (a double-clicked `.tex`) before the frontend was ready.
/// The frontend drains them once on launch with `take_pending_files`.
#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

#[tauri::command]
fn take_pending_files(state: tauri::State<PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

/// Blur radius (in points) behind the window, like Terminal's "Blur" slider. Small enough
/// that the wallpaper stays recognisable through the glass; the tint lives in CSS.
#[cfg(target_os = "macos")]
const WINDOW_BLUR_RADIUS: i32 = 24;

#[cfg(target_os = "macos")]
mod glass {
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
        .manage(PendingFiles::default())
        .manage(latex::Builds::default())
        .invoke_handler(tauri::generate_handler![
            files::read_text_file,
            files::write_text_file,
            files::read_file_bytes,
            files::list_project,
            files::read_session,
            files::write_session,
            latex::build_latex,
            take_pending_files,
        ])
        .setup(|_app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = _app.get_webview_window("main") {
                let ns_window = window.ns_window()?;
                if !glass::set_background_blur(ns_window, WINDOW_BLUR_RADIUS) {
                    eprintln!("pretty-latex: could not set the window blur; glass stays unblurred");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building pretty-latex")
        .run(|app, event| {
            // macOS hands over double-clicked files with this event, at launch and later.
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|path| path.to_string_lossy().into_owned())
                    .collect();
                if paths.is_empty() {
                    return;
                }
                // Queue them for a frontend that isn't listening yet, and tell one that is.
                app.state::<PendingFiles>()
                    .0
                    .lock()
                    .unwrap()
                    .extend(paths.clone());
                let _ = app.emit("open-files", paths);
            }
        });
}
