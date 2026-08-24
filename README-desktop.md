# Violet Enterprise Desktop Apps

Violet Enterprise is distributed as a native desktop shell that connects to a
Violet server. The desktop app does not bundle the API or database: run Violet
through the cloud deployment or the Docker self-host bundle first, then point
the desktop app at that server address.

## Download a release

Desktop installers will be linked here once the first verified public release
has been published. Until then, build the package locally or run the GitHub
Actions workflow from the repository's intended public destination.

After a public release is available:

1. Open the project's GitHub Releases page.
2. On Windows, download the `.exe` setup installer. The `.msi` is available as
   an alternative package for managed Windows environments.
3. On macOS, download the `.dmg` matching the Mac's processor:
   - `x86_64` for Intel Macs
   - `aarch64` for Apple Silicon Macs (M1/M2/M3/M4)
4. Install the app and launch **Violet Enterprise**.
5. On first launch, enter the address of the Violet server:
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

The MSI package is also published for organizations that distribute software
through Windows management tools.

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