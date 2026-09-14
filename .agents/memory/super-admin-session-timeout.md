---
name: Super Admin inactivity
description: The inactivity boundary for hosted platform administrator sessions.
---

Hosted Super Admin sessions must expire after 30 minutes without activity. The API is authoritative: it persists and refreshes session activity, rejects stale sessions, and removes them. The browser mirrors the timeout for immediate logout.

**Why:** A browser-only timer can be suspended or bypassed, while an API-only timeout leaves an idle tab appearing signed in. Both layers are needed for a clear and enforceable security boundary.

**How to apply:** Keep this timeout limited to hosted `super_admin` sessions. Do not apply it to ordinary POS, cashier, or manager sessions unless the security policy changes.