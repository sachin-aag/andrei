import { expect, type Page } from "@playwright/test";

/** Stable mock engineer from `MOCK_USERS` (Test Engineer). */
const E2E_ENGINEER_USER_ID = "7";

export async function unlockIfNeeded(page: Page) {
  if (
    !(await page
      .getByRole("heading", { name: /enter access password/i })
      .isVisible()
      .catch(() => false))
  ) {
    return;
  }
  const password = process.env.SITE_ACCESS_PASSWORD ?? "@ndrei@2026";
  await page.getByLabel(/^password$/i).fill(password);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
}

async function loginViaApi(page: Page) {
  const loginRes = await page.request.post("/api/auth/login", {
    data: { userId: E2E_ENGINEER_USER_ID },
    headers: { "Content-Type": "application/json" },
  });
  expect(loginRes.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /new report/i })).toBeVisible({
    timeout: 15_000,
  });
}

/** Mock login: pick an engineer from the workspace user picker (or API fallback in CI). */
export async function loginAsEngineer(page: Page) {
  await expect(
    page.getByRole("heading", { name: /sign in to your workspace/i })
  ).toBeVisible();

  const userSelect = page.locator("#user-select");
  const uiReady = await userSelect
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!uiReady) {
    // Client login dialog is client-only; CI dev can block HMR from 127.0.0.1.
    await loginViaApi(page);
    return;
  }

  await userSelect.click();
  await page.getByRole("option").filter({ hasText: /engineer|qc/i }).first().click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });
}
