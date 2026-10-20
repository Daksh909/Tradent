import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    // Lets a machine with a preinstalled Chromium skip `playwright install`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `pnpm next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/market-status`,
    reuseExistingServer: !process.env.CI,
    env: {
      // No broker keys: the market status must say so rather than guess.
      ALPACA_BROKER_API_KEY: "",
      ALPACA_BROKER_API_SECRET: "",
      TRADENT_DEMO_SIGN_IN: "true",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else-0123456789",
      // Placeholder OAuth apps: tests check the redirect to GitHub and Google, never complete it.
      GITHUB_CLIENT_ID: "e2e-github-client",
      GITHUB_CLIENT_SECRET: "e2e-github-secret",
      GOOGLE_CLIENT_ID: "e2e-google-client",
      GOOGLE_CLIENT_SECRET: "e2e-google-secret",
      CRON_SECRET: "e2e-cron-secret-0123456789",
    },
  },
});
