use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
};

use tauri::Manager;

fn startup_log_path() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("Violet Enterprise").join("startup.log")
}

fn report_startup_error(error: &str) {
    let log_path = startup_log_path();
    let log_result = (|| -> std::io::Result<()> {
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)?;
        writeln!(log, "Violet Enterprise startup failure: {error}")?;
        Ok(())
    })();

    let detail = match log_result {
        Ok(()) => format!(
            "Violet Enterprise could not start.\n\n{error}\n\nDiagnostic log:\n{}",
            log_path.display()
        ),
        Err(log_error) => format!(
            "Violet Enterprise could not start.\n\n{error}\n\nThe diagnostic log could not be written: {log_error}"
        ),
    };

    #[cfg(windows)]
    show_startup_error(&detail);

    #[cfg(not(windows))]
    eprintln!("{detail}");
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(
        window: *mut std::ffi::c_void,
        text: *const u16,
        caption: *const u16,
        flags: u32,
    ) -> i32;
}

#[cfg(windows)]
fn show_startup_error(detail: &str) {
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let text = wide(detail);
    let caption = wide("Violet Enterprise startup error");

    // MB_OK | MB_ICONERROR
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            0x0000_0010,
        );
    }
}

/// Navigate the main webview to an arbitrary URL.
/// Called from JS after the operator enters and saves their server address.
#[tauri::command]
fn navigate_to(url: String, webview: tauri::WebviewWindow) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    webview.navigate(parsed).map_err(|e| e.to_string())
}

/// Return the app version from Cargo.toml (shown in the setup screen).
#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Add a "Configure Server" menu item on desktop so users can reconfigure
            // without clearing app data manually.
            #[cfg(desktop)]
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};

                let configure = MenuItemBuilder::new("Configure Server")
                    .id("configure_server")
                    .build(app)?;
                let menu = MenuBuilder::new(app).items(&[&configure]).build()?;

                if let Some(win) = app.get_webview_window("main") {
                    win.set_menu(menu)?;
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            // After the user connects to a remote Violet server the webview runs the
            // operator's site — our JS hook no longer exists there.  Navigate back
            // to the bundled local setup page with ?reconfigure=1 so the React app
            // knows to show the configuration screen instead of auto-connecting.
            if event.id().as_ref() == "configure_server" {
                if let Some(win) = app.get_webview_window("main") {
                    if let Ok(url) = "tauri://localhost?reconfigure=1".parse::<url::Url>() {
                        let _ = win.navigate(url);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![navigate_to, app_version])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        report_startup_error(&error.to_string());
    }
}
