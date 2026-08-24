---
name: Self-hosted schema parity
description: Keeping the Docker database bootstrap compatible with application schema changes.
---

Keep the self-hosted database bootstrap SQL in step with Drizzle schema changes, including idempotent upgrades for already-persistent databases.

**Why:** LAN deployments initialize and upgrade their PostgreSQL database through the Docker bootstrap SQL. Updating only the application schema can leave self-hosted installations missing newly queried tables or columns.

**How to apply:** When adding or changing persisted application data, update both schema definitions and the bootstrap SQL with safe `CREATE ... IF NOT EXISTS` or `ALTER ... ADD COLUMN IF NOT EXISTS` statements as appropriate.