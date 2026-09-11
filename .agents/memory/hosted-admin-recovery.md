---
name: Hosted admin recovery
description: Security boundary for one-time hosted super-admin recovery.
---

Emergency hosted admin recovery is production-only, promotes an existing account without changing its password, and records consumption in the database so the trigger cannot be reused on later startups.

**Why:** A deployment-time recovery path must restore platform access without creating a recurring privilege-escalation mechanism or unexpectedly replacing a user's working credential.

**How to apply:** Keep the trigger out of self-hosted and development runtimes, serialize concurrent startup attempts, write an auditable one-time marker in the same transaction as the role change, and remove the deployment trigger after access is confirmed.