use tauri::Manager;

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
    tauri::Builder::default()
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
        .run(tauri::generate_context!())
        .expect("error while running Violet Enterprise");
}
