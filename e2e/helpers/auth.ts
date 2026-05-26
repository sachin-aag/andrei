import { expect, type Page } from "@playwright/test";

/** Stable mock engineer from `MOCK_USERS` (Test Engineer). */
const E2E_ENGINEER_USER_ID = "7";

const SITE_ACCESS_PASSWORD =
  process.env.SITE_ACCESS_PASSWORD ?? "@ndrei@2026";

/** Acquire the site-access cookie via the API if the gate is enabled. */
async function acquireSiteAccessIfNeeded(page: Page) {
  const res = await page.request.post("/api/site-access", {
    data: { password: SITE_ACCESS_PASSWORD },
    headers: { "Content-Type": "application/json" },
  });
  // 503 = gate disabled, anything 2xx = unlocked, 401 = wrong password.
  if (res.status() === 503) return;
  if (!res.ok()) {
    throw new Error(
      `site-access POST failed: ${res.status()} ${await res.text()}`
    );
  }
}

/**
 * Backwards-compat shim — older specs called this after navigating to "/".
 * The API-first login below makes it a no-op, but kept so existing specs
 * compile without changes.
 */
export async function unlockIfNeeded(_page: Page) {
  // no-op: loginAsEngineer handles unlock + session via API
}

/**
 * Mock login as an engineer, entirely via API. Avoids depending on
 * client-side hydration of the login dialog (which can be brittle in CI).
 */
export async function loginAsEngineer(page: Page) {
  await acquireSiteAccessIfNeeded(page);

  const loginRes = await page.request.post("/api/auth/login", {
    data: { userId: E2E_ENGINEER_USER_ID },
    headers: { "Content-Type": "application/json" },
  });
  expect(
    loginRes.ok(),
    `auth/login failed: ${loginRes.status()} ${await loginRes.text()}`
  ).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("button", { name: /new report/i }).first()).toBeVisible({
    timeout: 30_000,
  });
}
