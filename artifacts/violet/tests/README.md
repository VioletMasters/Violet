# Onboarding staging smoke test

The normal Playwright command uses deterministic API responses and does not touch
external services. The real-service suite is a separate, opt-in project. Run it
only against a disposable staging deployment:

```bash
PLAYWRIGHT_STAGING_BASE_URL=https://staging.example.com \
PLAYWRIGHT_STAGING_CHECKOUT_ORIGIN=https://checkout.example-provider.com \
PLAYWRIGHT_STAGING_RELEASE_VERSION=1.8.0 \
PLAYWRIGHT_STAGING_RELEASE_ASSET_PLATFORM=windows \
PLAYWRIGHT_STAGING_RELEASE_ASSET_FILE=violet-windows.exe \
pnpm --filter @workspace/violet exec playwright test \
  --project=staging tests/onboarding-staging.spec.ts
```

All five values above must be set. The first two are the allowlisted staging
application and hosted-checkout URLs; the release values identify the package
that the staging administrator seeded and published in the stable channel.
`PLAYWRIGHT_STAGING_NO_RELEASE_CHANNEL` may be set when another channel is
reserved for the no-release assertion; it defaults to `nightly`.

Before running the suite, explicitly enable the cleanup route on the staging
API only:

```bash
VIOLET_STAGING_CLEANUP_ENABLED=true
```

The route is also protected by the explicit confirmation sent by the test. It
authenticates as the disposable owner, requires the tenant and owner email to
use `@staging.invalid`, and only permits that owner to remove its own tenant.
It is not enabled by default and is not a production cleanup mechanism.

The suite:

- creates unique synthetic `@staging.invalid` accounts, so it never needs a
  real customer's login;
- verifies registration, the real hosted checkout redirect, the published
  stable asset, and the API's unavailable response for an unseeded channel;
- does not enter checkout details or complete a charge;
- cancels the paid account's pending checkout configuration and removes both
  disposable tenants, their users, sessions, subscriptions, settings, stores,
  and registers when each test finishes;
- emits an auditable staging-tenant deletion event for each cleanup.

If teardown is interrupted, the test reports the affected synthetic email and
tenant ID with manual recovery steps: cancel the pending checkout in the
provider dashboard and remove the orphaned staging tenant through the approved
staging admin cleanup process. Keep the
seeded stable release if it is shared by other staging checks; otherwise
unpublish/archive it and remove its uploaded package through the admin release
workflow. Never point this suite at production or use a production customer
account. The cleanup request also invalidates every session belonging to the
disposable tenant, so no separate logout request is needed.