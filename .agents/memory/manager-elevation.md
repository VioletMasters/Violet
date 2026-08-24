---
name: Manager elevation
description: Security and UX contract for Violet's manager-protected business tools.
---

Business-management access is a separate, 15-minute elevation rather than a role-only application session. The elevation token is signed with the deployment session secret and binds a token hash to the authenticated session and tenant. The browser keeps it only in session storage.

**Why:** Cashiers must retain uninterrupted POS product lookup and checkout access, while business reports, settings, staff, inventory, suppliers, subscriptions, and catalog/customer changes require a manager credential. Signing keeps an active elevation usable through ordinary API restarts or across server instances without persisting a separate grant.

**How to apply:** Protected operations must require both the normal bearer session and the manager-elevation header. Clear the browser grant on sign-out, login changes, and expiry. Keep the API boundary authoritative; hiding management navigation alone is not sufficient.