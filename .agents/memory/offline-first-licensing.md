---
name: Offline-first licensing
description: The durable licensing boundary between hosted Violet and self-hosted Store Hosts.
---

Self-hosted Violet contacts hosted Violet to validate the account and sync the license during local sign-in only. After authentication, Store Host requests must remain local and must not periodically revalidate the hosted license.

**Why:** Store operations must continue through internet outages, while hosted Violet remains the authority for upgrades and password recovery.

**How to apply:** Preserve an active cached paid plan through its stored period end; if it is expired or unavailable, use Free. A subsequent online local sign-in is the sync point for an upgrade.