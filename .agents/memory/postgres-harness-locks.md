---
name: PostgreSQL harness lock synchronization
description: How to synchronize forced-shutdown integration scenarios at a database lock boundary.
---

Integration harnesses that hold a PostgreSQL advisory lock in a child `psql` process should observe the lock through `pg_locks`, not through child-process stdout. When stdout is piped, `psql` can buffer output until a later statement finishes, making a test start its critical request after the lock has already been released.

**Why:** A checkout interruption test must prove the request was inside the transaction before terminating the Store Host; timing or buffered process output can create a false pass or miss the boundary entirely.

**How to apply:** Start the lock holder, poll for its granted advisory lock, then poll for a waiting lock from the application transaction before forcing termination. Release the holder only after the application process is dead.