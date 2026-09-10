---
name: Docker package-manager pinning
description: Why release Dockerfiles must use an explicit pnpm version instead of tracking the latest release.
---

Pin pnpm to a verified major and version in release Docker images. Do not use
`pnpm@latest` in image builds.

**Why:** A new pnpm major changed approved-build enforcement and caused clean
Store Host web-image builds to reject the explicit esbuild rebuild, while
cached images continued to hide the failure.

**How to apply:** Upgrade the pinned version deliberately, then verify clean
API and web image builds rather than relying on Docker layer cache.