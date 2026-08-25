import { expect, test, type Page } from "@playwright/test";
import { gotoWithNavigationRetry } from "./helpers/navigation";
import { loginAsTestUser, scopedTestEmail } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

function tourEmail(): string {
  return scopedTestEmail(
    process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com",
    `product-tour-${test.info().project.name}`
  );
}

async function loginWithTour(page: Page, productTour: boolean | "resume") {
  await loginAsTestUser(page, {
    email: tourEmail(),
    role: "engineer",
    productTour,
  });
  await gotoWithNavigationRetry(page, "/", { waitUntil: "load" });
}

test.describe("product walkthrough", () => {
  test("shows on first login and resumes after skip", async ({ page }) => {
    await loginWithTour(page, true);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /welcome to/i })).toBeVisible({
      timeout: 15_000,
    });

    await dialog.getByRole("button", { name: /let's go/i }).click();
    await expect(
      dialog.getByRole("heading", { name: /your reports live here/i })
    ).toBeVisible();

    await dialog.getByRole("button", { name: /^skip for now$/i }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /my reports/i })).toBeVisible();

    await loginWithTour(page, "resume");
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: /your reports live here/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("dismiss forever keeps the tour closed on the next session", async ({
    page,
  }) => {
    await loginWithTour(page, true);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /don't show this tour again/i }).click();
    await expect(dialog).toHaveCount(0);

    await loginWithTour(page, "resume");
    await expect(page.getByRole("heading", { name: /my reports/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("replay from profile starts the tour again", async ({ page }) => {
    await loginWithTour(page, true);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole("button", { name: /don't show this tour again/i }).click();

    await gotoWithNavigationRetry(page, "/profile", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible();
    await page.getByRole("button", { name: /replay product tour/i }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: /welcome to/i })
    ).toBeVisible();
  });
});
