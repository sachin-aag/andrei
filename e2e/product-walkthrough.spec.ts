import { expect, test } from "@playwright/test";
import {
  gotoWithNavigationRetry,
  parkPageForSessionSwap,
} from "./helpers/navigation";
import { scopedTestEmail } from "./helpers/auth";

const TOUR_EMAIL = scopedTestEmail(
  process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com",
  "product-tour"
);

test.describe.configure({ mode: "serial" });

async function loginWithTour(
  page: import("@playwright/test").Page,
  productTour: boolean | "resume"
) {
  await parkPageForSessionSwap(page);
  await page.context().clearCookies();
  const res = await page.request.post("/api/test/login", {
    data: {
      email: TOUR_EMAIL,
      role: "engineer",
      productTour,
    },
  });
  expect(res.ok(), `test login failed (${res.status()})`).toBeTruthy();
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
