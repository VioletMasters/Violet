---
name: Manager elevation
description: Security and UX contract for Violet's manager-protected business tools.
---

Business-management access is a separate, 15-minute elevation rather than a role-only application session for ordinary managers. Hosted `super_admin` users are the deliberate exception: they bypass plan gates and manager elevation, while tenant scoping still applies. Self-hosted sessions still require online license verification.

**Why:** Cashiers must retain uninterrupted POS product lookup and checkout access, while business reports, settings, staff, inventory, suppliers, subscriptions, and catalog/customer changes require a manager credential. Platform administrators need complete hosted-product access for support and administration, but self-hosted license verification remains a product boundary. Signing keeps an active elevation usable through ordinary API restarts or across server instances without persisting a separate grant.

**How to apply:** Protected operations must require both the normal bearer session and the manager-elevation header unless the authenticated role is `super_admin`. POS exceptions must use purpose-limited endpoints with only the active checkout fields; never leave a full catalog or customer-management read available to ordinary sessions. Clear the browser grant on sign-out, login changes, and expiry. Keep the API boundary authoritative; hiding management navigation alone is not sufficient.