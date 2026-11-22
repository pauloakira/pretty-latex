//! Rust core of pretty-latex. For now it only opens the glass window; build (latexmk),
//! file and SyncTeX commands land here in later cards.

#[cfg(target_os = "macos")]
use tauri::Manager;

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
        .run(tauri::generate_context!())
        .expect("error while running pretty-latex");
}
