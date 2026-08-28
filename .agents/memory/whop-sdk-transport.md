---
name: Whop SDK and Replit transport
description: Non-obvious compatibility notes for Whop checkout integrations in this workspace.
---

Use the installed Whop TypeScript SDK's `WhopClient` constructor with a `token`, not `apiKey`; the package's default-export example does not match the installed module shape. The Replit connector proxy also expects an `Accept` header on direct helper requests.

**Why:** The workspace uses a newer SDK export surface than the generic integration reference, and proxy requests without an explicit response format can be rejected as malformed authentication.

**How to apply:** Keep Whop credentials server-only, fetch them through the Replit connection endpoint, instantiate `new WhopClient({ token })`, and include `Accept: application/json` (or the SSE variant for MCP) in connector proxy calls.