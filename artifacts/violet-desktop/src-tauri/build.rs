#[cfg(target_os = "linux")]
use std::process::Command;

fn main() {
    // Replit/Nix exposes zlib through pkg-config, but Cargo's C linker does not
    // automatically inherit its library search path. Add it only on Linux; the
    // native Windows and macOS CI runners discover their system zlib normally.
    #[cfg(target_os = "linux")]
    if let Ok(output) = Command::new("pkg-config")
        .args(["--variable=libdir", "zlib"])
        .output()
    {
        let lib_dir = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if !lib_dir.is_empty() {
            println!("cargo:rustc-link-search=native={lib_dir}");
        }
    }

    tauri_build::build()
}
