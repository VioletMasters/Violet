---
name: Employee login lifecycle
description: The durable policy for provisioning and managing employee login accounts.
---

Every newly created employee must have a unique email and a linked login user. Violet generates a temporary password, shows it once to the administrator, and requires the employee to replace it before using protected application APIs.

Employee profile, role, email, and active status changes must remain synchronized with the linked login user. Deactivation revokes sessions and blocks login; permanent employee deletion also removes the linked login account.

**Why:** Employee records are the administrator-facing source of truth, while login users enforce authentication and authorization. Allowing them to drift creates unauthorized access or unusable staff accounts.

**How to apply:** Any future employee import, bulk edit, invitation, reactivation, or deletion flow must update both records atomically and preserve the forced first-login password change.