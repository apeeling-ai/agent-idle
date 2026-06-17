// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Make the iOS WKWebView render edge-to-edge (true fullscreen) on every iPhone/iPad.
///
/// wry creates the webview with a flexible autoresizing frame (so the FRAME is already the full
/// screen) but never sets the scroll view's `contentInsetAdjustmentBehavior` — it defaults to
/// `.automatic`, which insets the scrolled content by the safe area. That shrinks the *layout
/// viewport* (window.innerHeight) by the status-bar + home-indicator insets (e.g. 874→778pt),
/// so `viewport-fit=cover` / `env(safe-area-inset-*)` can never reach the screen edges from CSS.
///
/// Setting it to `.never` (raw value 2) stops the automatic inset: the viewport becomes the full
/// screen and `env(safe-area-inset-*)` then reports the real notch/indicator insets, which the
/// CSS pads for. Done once at setup via Tauri's `with_webview` (no wry fork needed).
#[cfg(target_os = "ios")]
fn make_webview_fullscreen(app: &tauri::App) {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| unsafe {
        let wk = webview.inner() as *mut objc2::runtime::AnyObject;
        if wk.is_null() {
            return;
        }
        let scroll_view: *mut objc2::runtime::AnyObject = objc2::msg_send![wk, scrollView];
        if scroll_view.is_null() {
            return;
        }
        // UIScrollViewContentInsetAdjustmentNever = 2
        let _: () = objc2::msg_send![scroll_view, setContentInsetAdjustmentBehavior: 2_isize];
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            #[cfg(target_os = "ios")]
            make_webview_fullscreen(_app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
