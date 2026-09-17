---
name: Cross-device email verification
description: Waiting verification pages need a server-backed, scoped status signal when the email link may be opened on another device.
---

Same-browser storage events are useful as a fast path, but they cannot notify a waiting page on another device. Cross-device detection must use a short-lived signed monitor token issued during registration and a status response that exposes only the matching registration's verified boolean.

**Why:** The email link can be completed in a different browser or device, where localStorage and BroadcastChannel are unavailable to the original waiting page.

**How to apply:** Keep the one-time email token limited to the verification endpoint. Poll the scoped status endpoint from the waiting page, stop after verification or token expiry, and preserve the selected plan during the login redirect.