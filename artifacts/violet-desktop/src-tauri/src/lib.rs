use std::{
    collections::BTreeMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    thread,
    time::{Duration, Instant},
};

use rand::{rngs::OsRng, RngCore};
use serde::Serialize;
use tauri::{Manager, Runtime};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DockerStatus {
    available: bool,
    compose_available: bool,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedHostStatus {
    ready: bool,
    url: String,
    message: String,
}

fn docker_status() -> DockerStatus {
    let docker = Command::new("docker")
        .args(["version", "--format", "{{.Server.Version}}"])
        .output();
    match docker {
        Ok(output) if output.status.success() => {
            let compose = Command::new("docker").args(["compose", "version"]).output();
            match compose {
                Ok(output) if output.status.success() => DockerStatus {
                    available: true,
                    compose_available: true,
                    message: "Docker Desktop and Docker Compose are ready.".into(),
                },
                _ => DockerStatus {
                    available: true,
                    compose_available: false,
                    message: "Docker is installed, but Docker Compose v2 is unavailable. Update or start Docker Desktop.".into(),
                },
            }
        }
        _ => DockerStatus {
            available: false,
            compose_available: false,
            message:
                "Docker Desktop is not available. Install Docker Desktop, start it, then try again."
                    .into(),
        },
    }
}

#[tauri::command]
async fn get_docker_status() -> DockerStatus {
    tauri::async_runtime::spawn_blocking(docker_status)
        .await
        .unwrap_or(DockerStatus {
            available: false,
            compose_available: false,
            message: "Docker status could not be checked. Start Docker Desktop, then try again."
                .into(),
        })
}

fn random_hex(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    OsRng.fill_bytes(&mut value);
    value.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn dotenv_value(value: &str) -> Result<String, String> {
    if value.contains('\n') || value.contains('\r') {
        return Err("Credentials cannot contain line breaks.".into());
    }
    // Compose treats single-quoted .env values literally: in particular, `$`
    // is not interpolated. A quote is represented with Compose's documented
    // backslash-quote escape. Backslashes not before a quote stay literal.
    Ok(format!("'{}'", value.replace('\'', "\\'")))
}

fn normalise_email(value: &str) -> String {
    value.trim().to_lowercase()
}

// This deliberately handles the subset emitted by dotenv_value and normal
// unquoted Compose values. It preserves unrecognised lines when rewriting.
fn parse_dotenv(input: &str) -> BTreeMap<String, String> {
    input
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, raw) = line.split_once('=')?;
            let raw = raw.trim();
            let value = if raw.starts_with('\'') && raw.ends_with('\'') && raw.len() >= 2 {
                let mut result = String::new();
                let mut chars = raw[1..raw.len() - 1].chars().peekable();
                while let Some(ch) = chars.next() {
                    if ch == '\\' && chars.peek() == Some(&'\'') {
                        chars.next();
                        result.push('\'');
                    } else {
                        result.push(ch);
                    }
                }
                result
            } else if raw.starts_with('"') && raw.ends_with('"') && raw.len() >= 2 {
                let mut result = String::new();
                let mut escaped = false;
                for ch in raw[1..raw.len() - 1].chars() {
                    if escaped {
                        result.push(match ch {
                            'n' => '\n',
                            _ => ch,
                        });
                        escaped = false;
                    } else if ch == '\\' {
                        escaped = true;
                    } else {
                        result.push(ch);
                    }
                }
                if escaped {
                    result.push('\\');
                }
                result
            } else {
                raw.to_string()
            };
            Some((key.trim().to_string(), value))
        })
        .collect()
}

fn update_managed_env(
    path: &Path,
    email: &str,
    password: &str,
    license_url: &str,
    id_path: &Path,
) -> Result<(), String> {
    let existing = fs::read_to_string(path).unwrap_or_default();
    let mut values = parse_dotenv(&existing);
    // Existing values always win for infrastructure credentials. This avoids
    // invalidating database access or every signed session on reconfiguration.
    let installation_id = values
        .get("VIOLET_INSTALLATION_ID")
        .filter(|v| !v.is_empty())
        .cloned()
        .or_else(|| {
            fs::read_to_string(id_path)
                .ok()
                .filter(|v| !v.trim().is_empty())
                .map(|v| v.trim().to_string())
        })
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    values
        .entry("POSTGRES_USER".into())
        .or_insert_with(|| "violet".into());
    values
        .entry("POSTGRES_DB".into())
        .or_insert_with(|| "violetdb".into());
    values
        .entry("POSTGRES_PASSWORD".into())
        .or_insert_with(|| random_hex(32));
    values
        .entry("SESSION_SECRET".into())
        .or_insert_with(|| random_hex(48));
    values.insert("ADMIN_EMAIL".into(), normalise_email(email));
    values.insert("ADMIN_PASSWORD".into(), password.to_string());
    values.insert("VIOLET_LICENSE_SERVER_URL".into(), license_url.to_string());
    values.insert("VIOLET_INSTALLATION_ID".into(), installation_id.clone());
    let rendered = values
        .iter()
        .map(|(key, value)| dotenv_value(value).map(|escaped| format!("{key}={escaped}")))
        .collect::<Result<Vec<_>, _>>()?
        .join("\n")
        + "\n";
    fs::write(path, rendered)
        .map_err(|_| "Could not write the managed host configuration.".to_string())?;
    fs::write(id_path, installation_id)
        .map_err(|_| "Could not save the managed host identity.".to_string())
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = fs::File::open(archive).map_err(|_| {
        "The bundled Violet server files are missing. Reinstall the desktop app.".to_string()
    })?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| {
        "The bundled Violet server files are invalid. Reinstall the desktop app.".to_string()
    })?;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| "Could not read bundled Violet server files.".to_string())?;
        let Some(relative) = entry.enclosed_name().map(|path| path.to_owned()) else {
            continue;
        };
        let output = destination.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|_| "Could not create the managed server directory.".to_string())?;
        } else {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| "Could not create the managed server directory.".to_string())?;
            }
            let mut target = fs::File::create(output)
                .map_err(|_| "Could not install bundled Violet server files.".to_string())?;
            std::io::copy(&mut entry, &mut target)
                .map_err(|_| "Could not install bundled Violet server files.".to_string())?;
        }
    }
    Ok(())
}

fn managed_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("store-host"))
        .map_err(|_| "Could not determine the Violet application data directory.".to_string())
}

fn wait_for_managed_host(directory: PathBuf, rebuild: bool) -> Result<ManagedHostStatus, String> {
    let status = docker_status();
    if !status.available || !status.compose_available {
        return Err(status.message);
    }
    if !directory.join("docker-compose.yml").exists() {
        return Err(
            "The managed Store Host files are missing. Set up Store Host on this desktop again."
                .into(),
        );
    }
    let mut command = Command::new("docker");
    command.current_dir(&directory).args(["compose", "up"]);
    if rebuild {
        command.arg("--build");
    }
    let launched = command.arg("-d").status().map_err(|_| {
        "Could not start Docker. Confirm Docker Desktop is running, then try again.".to_string()
    })?;
    if !launched.success() {
        return Err("Docker could not start Violet. Ensure Docker Desktop has enough disk space and no other service is using port 80.".into());
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "Could not check the managed Violet server.".to_string())?;
    let deadline = Instant::now() + Duration::from_secs(120);
    while Instant::now() < deadline {
        if client
            .get("http://127.0.0.1/api/healthz")
            .send()
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            return Ok(ManagedHostStatus {
                ready: true,
                url: "http://127.0.0.1".into(),
                message: "Your Store Host is ready.".into(),
            });
        }
        thread::sleep(Duration::from_secs(2));
    }
    Err("Violet is still starting. Open Docker Desktop to check the Violet containers, then try again.".into())
}

fn install_and_start_managed_host(
    directory: PathBuf,
    archive: PathBuf,
    email: String,
    password: String,
    license_url: String,
) -> Result<ManagedHostStatus, String> {
    fs::create_dir_all(&directory)
        .map_err(|_| "Could not create the managed server directory.".to_string())?;
    if !directory.join("docker-compose.yml").exists() {
        extract_archive(&archive, &directory)?;
    }
    update_managed_env(
        &directory.join(".env"),
        &email,
        &password,
        &license_url,
        &directory.join(".violet-installation-id"),
    )?;
    wait_for_managed_host(directory, true)
}

#[tauri::command]
async fn start_managed_host(
    app: tauri::AppHandle,
    admin_email: String,
    admin_password: String,
    license_url: String,
) -> Result<ManagedHostStatus, String> {
    if admin_email.trim().is_empty() || admin_password.is_empty() {
        return Err("Enter the email and password for your hosted Violet account.".into());
    }
    let parsed_license = url::Url::parse(&license_url)
        .map_err(|_| "Enter a valid hosted Violet license URL.".to_string())?;
    if parsed_license.scheme() != "https" {
        return Err("The hosted Violet license URL must use HTTPS.".into());
    }
    let directory = managed_dir(&app)?;
    let archive = app
        .path()
        .resolve(
            "resources/violet-self-host.zip",
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|_| {
            "The bundled Violet server files are missing. Reinstall the desktop app.".to_string()
        })?;
    let email = normalise_email(&admin_email);
    let license_url = parsed_license.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        install_and_start_managed_host(directory, archive, email, admin_password, license_url)
    })
    .await
    .map_err(|_| "The managed Store Host operation stopped unexpectedly.".to_string())?
}

#[tauri::command]
async fn resume_managed_host(app: tauri::AppHandle) -> Result<ManagedHostStatus, String> {
    let directory = managed_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || wait_for_managed_host(directory, false))
        .await
        .map_err(|_| "The managed Store Host operation stopped unexpectedly.".to_string())?
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
        .invoke_handler(tauri::generate_handler![
            navigate_to,
            app_version,
            get_docker_status,
            start_managed_host,
            resume_managed_host
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        report_startup_error(&error.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::{dotenv_value, normalise_email, parse_dotenv};

    #[test]
    fn compose_dotenv_round_trips_practical_credential_characters() {
        let password = " dollar$ 'quote' \\\\ path # comment = value ";
        let encoded = dotenv_value(password).unwrap();
        assert_eq!(
            encoded,
            "' dollar$ \\'quote\\' \\\\ path # comment = value '"
        );
        let values = parse_dotenv(&format!("ADMIN_PASSWORD={encoded}\n"));
        assert_eq!(values["ADMIN_PASSWORD"], password);
    }

    #[test]
    fn dotenv_rejects_line_injection() {
        assert!(dotenv_value("safe\nEVIL=value").is_err());
    }

    #[test]
    fn email_is_trimmed_and_lowercased() {
        assert_eq!(normalise_email("  Owner@EXAMPLE.COM "), "owner@example.com");
    }
}
