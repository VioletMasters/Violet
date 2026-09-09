---
name: Windows Actions Docker engine
description: Windows desktop smoke tests that start Linux containers require an explicit Docker Desktop engine preflight.
---

Windows GitHub runners can have Docker Desktop in Windows-container mode even when Docker is installed and responsive. Linux-based Compose images then fail before the packaged Store Host starts. A desktop smoke test that depends on Linux containers must switch Docker Desktop to the Linux engine and verify `docker info` reports `OSType=linux` before invoking Compose.

**Why:** A failed local login assertion can be downstream noise from the Store Host never starting; the Docker daemon mode must be diagnosed first.

**How to apply:** Keep the engine switch and bounded readiness check in the Windows workflow, before the installer smoke script starts the local host.