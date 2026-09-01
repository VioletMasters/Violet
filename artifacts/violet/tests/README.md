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

The suite:

- creates unique synthetic `@staging.invalid` accounts, so it never needs a
  real customer's login;
- verifies registration, the real hosted checkout redirect, the published
  stable asset, and the API's unavailable response for an unseeded channel;
- does not enter checkout details or complete a charge;
- logs out both test sessions and cancels the paid account's pending checkout
  configuration when the test finishes.

After a run, a staging operator should remove the two disposable tenant records
and any related data using the environment's approved admin cleanup process.
If a run is interrupted before teardown, cancel the pending checkout in the
provider dashboard and remove the orphaned paid staging account. Keep the
seeded stable release if it is shared by other staging checks; otherwise
unpublish/archive it and remove its uploaded package through the admin release
workflow. Never point this suite at production or use a production customer
account.