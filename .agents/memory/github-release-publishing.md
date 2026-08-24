---
name: GitHub release publishing
description: Constraint affecting publication of Violet’s GitHub Actions desktop release workflow.
---

Use an authenticated Git push from a trusted development machine to publish the
Violet repository and version tags. Do not rely on the workspace GitHub
connector to transfer the project or create the desktop-release workflow.

**Why:** In this environment, the GitHub connector can read repositories and
create unattached blobs, but requests to Git tree creation and `.github`
workflow paths are blocked upstream. This prevents publishing a working
Actions-based release through the connector API.

**How to apply:** Before attempting a release, ensure the local Git remote is
authenticated through GitHub CLI, Git Credential Manager, or a trusted desktop
Git client. Push the project branch and its version tag through Git; then use
the GitHub Actions run and Release assets as the source of truth.