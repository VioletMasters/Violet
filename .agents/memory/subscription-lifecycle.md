---
name: Subscription lifecycle
description: Product and billing rules for account tiers, cancellations, and plan changes.
---

Whop remains the source of truth for paid memberships. Violet may display and record the current account tier, but must not switch a paid tenant to another paid tier locally while an active Whop membership could still charge.

**Why:** Separate Whop memberships for an upgrade or downgrade can create overlapping charges and make local access disagree with billing.

**How to apply:** Use cancellation at period end as the normal customer/admin flow, allow reactivation while cancellation is scheduled, and only permit a local plan override after the paid membership is inactive. Record every activation, plan change, cancellation, and reactivation in subscription history.

Confirmed hosted downgrade policy: a confirmed canceled, expired, or fully refunded paid membership moves the tenant to Free without deleting products, customers, or historical sales. Existing records are retained; Free limits apply to new additions. A transient `past_due` state remains a billing-recovery state rather than immediately destroying access or data.

**Why:** Payment failures can be temporary, and automatic deletion during a downgrade would damage inventory and sales history.

**How to apply:** Clear the paid membership mapping only after Whop confirms the membership ended, issue a recorded downgrade event, keep the tenant license valid on Free, and enforce capped limits on new records.