import { expect, test } from "@playwright/test";

test("login page renders with email form", async ({ page }) => {
  await page.goto("/");

  // Unauthenticated visit to "/" should redirect to /login
  await expect(
    page.getByRole("heading", { name: /sign in to your workspace/i })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel(/work email/i)).toBeVisible();
});
