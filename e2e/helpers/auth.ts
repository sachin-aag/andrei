import { expect, type Page } from "@playwright/test";

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

/** Mock login: pick an engineer from the workspace user dialog. */
export async function loginAsEngineer(page: Page) {
  await expect(
    page.getByRole("heading", { name: /sign in to your workspace/i })
  ).toBeVisible();

  const userDialog = page.getByRole("dialog", { name: /select user/i });
  await expect(userDialog).toBeVisible({ timeout: 30_000 });

  await userDialog.locator("#user-select").click();
  await page.getByRole("option").filter({ hasText: /engineer|qc/i }).first().click();
  await userDialog.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL("/", { timeout: 15_000 });
}
