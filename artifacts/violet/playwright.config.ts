import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 24205);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const stagingBaseURL = process.env.PLAYWRIGHT_STAGING_BASE_URL;
const stagingCheckoutOrigin = process.env.PLAYWRIGHT_STAGING_CHECKOUT_ORIGIN;
const stagingConfigured = Boolean(stagingBaseURL && stagingCheckoutOrigin);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /onboarding-staging\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: /onboarding-staging\.spec\.ts/,
      // Keep the mobile viewport and touch/user-agent behavior while using
      // Chromium, which is the browser installed by the smoke-test command.
      use: { ...devices["Pixel 5"] },
    },
    ...(stagingConfigured
      ? [
          {
            name: "staging",
            testMatch: /onboarding-staging\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: stagingBaseURL,
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: `PORT=${port} BASE_PATH=/ pnpm --filter @workspace/violet run dev`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});