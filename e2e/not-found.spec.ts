import { expect, test } from "@playwright/test";
import { authenticateAsEngineer } from "./helpers/auth";
import { gotoWithNavigationRetry } from "./helpers/navigation";

test.describe("branded 404", () => {
  test("unknown path while signed out still goes to login", async ({ page }) => {
    await gotoWithNavigationRetry(page, "/this-page-does-not-exist");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /sign in to your workspace/i })
    ).toBeVisible();
  });

  test("shows a branded 404 for unknown paths when signed in", async ({
    page,
  }) => {
    await authenticateAsEngineer(page);
    const response = await gotoWithNavigationRetry(
      page,
      "/this-page-does-not-exist"
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /this page isn’t here/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /back to reports/i })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /document vault/i })
    ).toBeVisible();
  });

  test("missing report routes show the branded 404", async ({ page }) => {
    await authenticateAsEngineer(page);
    for (const path of [
      "/reports/missing-report-id",
      "/reports/missing-report-id/edit",
    ]) {
      await gotoWithNavigationRetry(page, path);
      await expect(
        page.getByRole("heading", { name: /this page isn’t here/i }),
        path
      ).toBeVisible();
    }
  });

  test("Back to reports returns to the dashboard", async ({ page }) => {
    await authenticateAsEngineer(page);
    await gotoWithNavigationRetry(page, "/this-page-does-not-exist");
    await expect(
      page.getByRole("heading", { name: /this page isn’t here/i })
    ).toBeVisible();
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 }),
      page.getByRole("link", { name: /back to reports/i }).click(),
    ]);
    await expect(
      page.getByRole("heading", { name: /my reports/i })
    ).toBeVisible({ timeout: 15_000 });
  });
});
