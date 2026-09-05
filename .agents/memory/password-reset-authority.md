---
name: Password reset authority
description: The trust and synchronization policy for password recovery across hosted Violet and self-hosted Store Hosts.
---

Hosted Violet is the only password-reset authority. Recovery requests use short-lived, single-use emailed links against the hosted account, and a successful reset revokes every hosted session for that user.

Store Hosts forward recovery requests to hosted Violet. On a later Store Host login, hosted credentials must be verified first; only then may the Store Host replace its local password hash with the verified password.

**Why:** Independent local resets or accepting a stale local password after a hosted reset would let hosted and self-hosted credentials diverge and could preserve access that the hosted account owner intended to revoke.

**How to apply:** Any future reset, account-recovery, offline-login, credential-caching, or Store Host authentication work must preserve hosted authority and synchronize local credentials only after successful hosted verification.