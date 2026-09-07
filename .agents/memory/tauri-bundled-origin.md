---
name: Tauri bundled origin
description: The origin used by Tauri 2 bundled WebviewUrl::App pages and the security implication for native setup commands.
---

Tauri 2 bundled `WebviewUrl::App` pages run at `http://tauri.localhost`, not only at the legacy `tauri://localhost` origin.

**Why:** A native setup command that validates its caller origin can reject legitimate bundled-page calls if it only recognizes the legacy protocol. The UI then remains on the setup page even though the backend startup work may have completed.

**How to apply:** When guarding commands invoked from the packaged setup screen, allow `http://tauri.localhost` (and retain the legacy origin only for compatibility). Use the same bundled origin when navigating back to the setup page from native menu actions.