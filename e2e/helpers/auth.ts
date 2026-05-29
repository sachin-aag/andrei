import { expect, type Page } from "@playwright/test";

const TEST_AUTH_EMAIL =
  process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com";

/**
 * Log in as a test engineer by calling the test-only JWT-minting endpoint.
 * Requires ALLOW_TEST_LOGIN=true and TEST_AUTH_EMAIL on the app server (see playwright.config.ts).
 */
export async function loginAsEngineer(page: Page) {
  const res = await page.request.post("/api/test/login");
  expect(
    res.ok(),
    `test login failed (${res.status()}): is TEST_AUTH_EMAIL="${TEST_AUTH_EMAIL}" set and does a matching workspace user exist?`
  ).toBeTruthy();

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /new report/i }).first()
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Kept for backwards-compatibility with existing specs.
 * The site-access password gate was replaced by Auth.js authentication.
 */
export async function unlockIfNeeded() {
  // no-op
}
