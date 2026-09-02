---
name: LAN server authority
description: The durable authority and outage model for self-hosted store servers and cashier clients.
---

Each self-hosted store has one authoritative Violet server for its PostgreSQL data and persistent files. Cashier devices are clients and must not maintain independent canonical store databases.

Completed sales require confirmation from the store server. A failed checkout remains an unconfirmed cart and retries use the same idempotency key; Violet does not silently finalize or queue disconnected payments.

**Why:** Independent register databases create stock, shift, payment, and receipt conflicts. Requiring a server commit preserves transactional inventory while idempotent retries prevent duplicate charges and stock deductions after a lost response.

**How to apply:** New desktop, mobile, PWA, file-upload, receipt, backup, and offline features must preserve server ownership. Any future offline sales mode needs an explicit reconciliation and payment-risk design rather than bypassing the server.