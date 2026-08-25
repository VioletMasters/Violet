---
name: Windows desktop runtime
description: Runtime packaging and diagnostics requirements for Violet’s Windows Tauri release.
---

Use Tauri’s offline WebView2 installer mode for Windows releases and retain a
native startup-error dialog plus a per-user diagnostic log.

**Why:** Violet supports LAN deployments where internet access can be absent.
The default WebView2 bootstrapper can leave an installed desktop app unable to
start with no visible explanation when the runtime is unavailable.

**How to apply:** Keep the Windows bundle’s WebView2 mode self-contained, make
CI guard the packaging choice and installer size, and direct startup failures
to the user-visible message and the local diagnostic log.