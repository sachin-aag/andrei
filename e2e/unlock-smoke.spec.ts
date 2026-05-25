import { expect, test } from "@playwright/test";

test("auth entry page renders", async ({ page }) => {
  await page.goto("/unlock");

  // Without SITE_ACCESS_PASSWORD the unlock page redirects to /login,
  // so accept either heading.
  await expect(
    page.getByRole("heading", {
      name: /enter access password|sign in to your workspace/i,
    }),
  ).toBeVisible({ timeout: 30_000 });
});
