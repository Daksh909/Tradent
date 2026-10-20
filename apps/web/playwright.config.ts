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
    // No broker keys: the market status must say so rather than guess.
    env: { ALPACA_BROKER_API_KEY: "", ALPACA_BROKER_API_SECRET: "" },
  },
});
