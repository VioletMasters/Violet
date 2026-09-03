# Violet Enterprise Desktop Apps

Violet Enterprise is distributed as a native desktop shell. On first launch it
asks which role this computer should have and remembers that choice and server
address. Use **Configure Server** in the native app menu to return to this role
selection at any time.

## First-run modes

- **Hosted Cloud** opens `https://Violetsolutions.replit.app`.
- **Store Host (this desktop)** installs and manages the bundled Violet stack
  with Docker Desktop, then opens the local host at `http://127.0.0.1`.
- **Store Host (existing server)** connects this server computer to a Violet
  stack installed separately.
- **Store Client** connects a register to an existing Store Host.

The managed Store Host requires [Docker Desktop](https://www.docker.com/products/docker-desktop/)
to be installed and running, including Docker Compose v2. The setup asks for
the hosted Violet account email/password and HTTPS license URL; it creates its
own local secrets and preserves Docker named volumes across starts. LAN host
addresses may use HTTP; use HTTPS for hosts exposed beyond the trusted LAN.

## Download a release

Desktop installers will appear on the
[Violet Enterprise Releases](https://github.com/VioletMasters/Violet/releases)
page after the first tagged release is published.

After a release is available:

1. Open the Violet Enterprise Releases page.
2. On Windows, download the `.exe` setup installer. The `.msi` is available as
   an alternative package for managed Windows environments.
3. On macOS, download the `.dmg` matching the Mac's processor:
   - `x86_64` for Intel Macs
   - `aarch64` for Apple Silicon Macs (M1/M2/M3/M4)
4. Install the app and launch **Violet Enterprise**.
5. On first launch, select the appropriate role. For an existing host, enter
   its address:
   - LAN Docker host: `http://192.168.1.10`
   - Cloud deployment: `https://pos.example.com`

The desktop app remembers the server address securely in its local Tauri store
and opens it automatically on future launches. Use **Configure Server** from
the native app menu to change it later.

## Windows installer behavior

The NSIS setup installer:

- installs for the current Windows user, so administrator permission is not required in normal use;
- creates a **Violet Enterprise** shortcut on the Desktop;
- creates a **Violet Enterprise** shortcut in the Start Menu;
- includes an uninstall entry in Windows Settings.

The Windows package includes the WebView2 runtime installer needed by Violet,
so first launch does not require downloading a runtime from the internet. The
Windows installer is therefore substantially larger than the application
frontend itself. Windows may still ask for permission to install the runtime
for the machine.

The MSI package is also published for organizations that distribute software
through Windows management tools.

If Windows installs Violet but the window does not appear, launch it once from
the Start Menu and check
`%LOCALAPPDATA%\Violet Enterprise\startup.log`. A startup error dialog includes
the same path when the native shell cannot initialize. If the app opens but its
interface fails to render, use the **Try again** button and relaunch the app.

## macOS packaging

The release workflow creates an `.app` bundle and a `.dmg` installer for both
Intel and Apple Silicon Macs. The app is currently unsigned and not notarized.
macOS may therefore show a Gatekeeper warning on first launch; operators can
approve the app in **System Settings → Privacy & Security**. Add Apple signing
and notarization credentials to the GitHub Actions secrets before distributing
the app broadly.

## Creating a release

The workflow in `.github/workflows/build-desktop.yml` runs on version tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions builds:

- Windows x64: NSIS `.exe` and `.msi`
- macOS Intel: `.app` and `.dmg`
- macOS Apple Silicon: `.app` and `.dmg`

The generated files are uploaded to the workflow run and attached to the
matching GitHub Release automatically. The repository's GitHub Actions settings
must allow the workflow's `GITHUB_TOKEN` to write release contents.

If a Windows build reports an HTTP 5xx error while downloading NSIS from
`tauri-apps/binary-releases`, the workflow treats that as a transient bundler
failure, retries it up to three times, and caches the downloaded bundler tools.
Use **Re-run failed jobs** from the workflow run after confirming the upstream
download is available again. Compilation, signing, and configuration errors are
not retried.

## Local development

From the repository root:

```bash
pnpm --filter @workspace/violet-desktop typecheck
pnpm --filter @workspace/violet-desktop build
pnpm --filter @workspace/violet-desktop tauri build --bundles deb,rpm
```

The first two commands work on Linux. Native Tauri installers must be built on
the matching operating system; the GitHub Actions workflow provides the
Windows and macOS runners.