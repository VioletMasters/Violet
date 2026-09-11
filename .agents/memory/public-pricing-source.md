---
name: Public pricing source
description: Boundary between marketing plan display prices and provider checkout prices.
---

The public pricing page must read active plan data from the public plans API. The local plan price/currency is the admin-managed display value; Whop checkout price/currency is the provider-controlled charge and may legitimately differ.

**Why:** Keeping these values separate prevents stale hardcoded marketing prices while avoiding a false claim that changing a local display price changed the live Whop offer.

**How to apply:** Use the API response for plan names, visibility, descriptions, limits, features, local prices, and checkout prices. If the currencies differ, show the local amount explicitly rather than silently substituting one for the other.