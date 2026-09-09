---
name: Wouter nested route wildcard
description: The Wouter catch-all route syntax required for nested application paths.
---

The application-level catch-all must use `/*` for nested paths such as `/reports/cash`. The `/:rest*` form used here only matched a single path segment, so nested URLs never reached the app router and rendered an empty root.

**Why:** A cashier settlements link exposed the issue because `/reports` worked while `/reports/cash` bypassed the outer route entirely.

**How to apply:** When adding nested management routes, keep the outer app route as `/*` and test at least one two-segment path in a browser smoke check.