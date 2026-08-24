---
name: Desktop CI lockfiles
description: GitHub-hosted desktop builds must use a public npm-registry lockfile.
---

The desktop package's committed npm lockfile must resolve tarballs through
`https://registry.npmjs.org/`, not Replit's internal package-firewall host.

**Why:** GitHub Actions runners cannot access Replit's internal registry, so
`npm ci` fails before native Windows or macOS packaging begins.

**How to apply:** When regenerating the desktop lockfile, use the public npm
registry and confirm a clean `npm ci` works from the desktop package before
relying on the release workflow.