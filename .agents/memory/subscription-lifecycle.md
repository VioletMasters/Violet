---
name: Subscription lifecycle
description: Product and billing rules for account tiers, cancellations, and plan changes.
---

Whop remains the source of truth for paid memberships. Violet may display and record the current account tier, but must not switch a paid tenant to another paid tier locally while an active Whop membership could still charge.

**Why:** Separate Whop memberships for an upgrade or downgrade can create overlapping charges and make local access disagree with billing.

**How to apply:** Use cancellation at period end as the normal customer/admin flow, allow reactivation while cancellation is scheduled, and only permit a local plan override after the paid membership is inactive. Record every activation, plan change, cancellation, and reactivation in subscription history.