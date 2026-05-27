import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: process.env.CI
      ? "pnpm run build && pnpm run start"
      : "pnpm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 180_000 : 120_000,
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://ci:ci@127.0.0.1:5432/ci",
      TEST_AUTH_EMAIL:
        process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com",
      AUTH_SECRET:
        process.env.AUTH_SECRET ?? "ci-test-secret-not-for-production-use",
    },
  },
});
