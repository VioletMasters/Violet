---
name: Playwright native runtime
description: Native library requirements for browser-based checks in this Replit container.
---

Browser-based checks may fail before launching Chromium when the container does not expose shared libraries such as glib or libgbm, even after the Playwright browser binary is downloaded.

**Why:** The application and test code can be correct while the browser process exits with a missing-library error. Adding temporary Nix packages can also modify `.replit`, creating unrelated project drift.

**How to apply:** Prefer the managed preview screenshot for a quick app smoke check. If Playwright must run, install runtime libraries through the package-management flow and restore any temporary `.replit` package entries before finishing.