---
name: Resend connector setup
description: The distinction between Violet's Replit Resend connector and Resend's external MCP server.
---

Violet transactional email must use the Replit-managed Resend connector attached to the project. Resend's MCP setup page is for external AI clients such as Cursor or Claude and does not configure application email.

**Why:** Removing the project integration can leave the existing authorized Resend connection in a `not_added` state; searching integrations and adding that connection restores app access without creating an MCP server.

**How to apply:** When Resend email fails after an integration change, inspect the connector state first. Re-add the authorized Resend connection to the project, restart the API, and only then test verification email delivery.