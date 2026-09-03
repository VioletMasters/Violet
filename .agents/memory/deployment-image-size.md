---
name: Deployment image size
description: The root Nix package set is included in autoscale deployment layers and desktop dependencies can push the image over the platform limit.
---

Keep desktop-only Linux build dependencies out of the root published environment when they are not needed by hosted services; build desktop releases in a separate environment instead.

**Why:** An autoscale publish failed during final layer upload because the image exceeded the 8 GiB layer limit after GUI and browser-support packages were added to the root Nix package list, while application builds themselves passed.

**How to apply:** Treat additions to the root `.replit` Nix package list as deployment-size changes. Prefer the smallest package set required by the hosted API and web artifacts, and validate the publish image after any desktop-toolchain change.