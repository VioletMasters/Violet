---
name: LAN server authority
description: The durable authority and outage model for self-hosted store servers and cashier clients.
---

Each self-hosted store has one authoritative Violet server for its PostgreSQL data and persistent files. Cashier devices are clients and must not maintain independent canonical store databases.

Desktop first-run setup distinguishes Hosted Cloud, Store Host, and Store Client. A desktop-managed Store Host orchestrates the bundled Violet Docker stack and its persistent volumes; clients connect directly to that Host.

Completed sales require confirmation from the store server. A failed checkout remains an unconfirmed cart and retries use the same idempotency key; Violet does not silently finalize or queue disconnected payments.

**Why:** Independent register databases create stock, shift, payment, and receipt conflicts. The user chose installer-managed hosting so operators do not manually configure Compose, while Docker remains the supported local API/PostgreSQL runtime.

**How to apply:** New desktop, mobile, PWA, file-upload, receipt, backup, and offline features must preserve server ownership. Host lifecycle changes must preserve database volumes and infrastructure secrets across restarts. Any future offline sales mode needs an explicit reconciliation and payment-risk design rather than bypassing the server.