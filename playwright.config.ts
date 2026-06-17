import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Load project env so `pnpm test:e2e` picks up DATABASE_URL / AUTH_SECRET without shell export.
loadEnv({ path: path.join(__dirname, ".env") });
loadEnv({ path: path.join(__dirname, ".env.local"), override: true });

const isCi = !!process.env.CI;
const localDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://andrei:andrei@127.0.0.1:5432/andrei_dev";
const ciDatabaseUrl = "postgresql://ci:ci@127.0.0.1:5432/ci";

/** Playwright always serves the app on 127.0.0.1:3000 — do not inherit dev AUTH_URL (e.g. :3001). */
const playwrightAuthUrl = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCi,
  // One dev server + local Postgres: cap parallelism to reduce ECONNRESET flakes.
  workers: isCi ? 2 : 2,
  timeout: 60_000,
  retries: 2,
  reporter: isCi ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? playwrightAuthUrl,
    // Review margin (lg+) and stable layout for sidebar overlap tests.
    viewport: { width: 1280, height: 900 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      dependencies: ["setup"],
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      dependencies: ["setup"],
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: isCi ? "pnpm run build && pnpm run start" : "pnpm run dev",
    url: playwrightAuthUrl,
    reuseExistingServer: !isCi,
    timeout: isCi ? 180_000 : 120_000,
    // Test-only flags — scoped to Playwright's webServer; do not set on Vercel prod/preview.
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      DATABASE_URL: isCi ? (process.env.DATABASE_URL ?? ciDatabaseUrl) : localDatabaseUrl,
      ALLOW_TEST_LOGIN: "true",
      ALLOW_TEST_SKIP_EVALUATION: "true",
      ALLOW_TEST_SKIP_SUGGESTIONS: "true",
      ALLOW_TEST_STUB_MATH_EXTRACTION: "true",
      AUTH_URL: playwrightAuthUrl,
      AUTH_TRUST_HOST: "true",
      TEST_AUTH_EMAIL:
        process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com",
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "ci-test-secret-not-for-production-use",
    },
  },
});
