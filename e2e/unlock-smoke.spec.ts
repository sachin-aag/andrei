import { expect, test } from "@playwright/test";

test("auth entry page renders", async ({ page }) => {
  await page.goto("/unlock");

  await expect(
    page.getByRole("heading", {
      name: /enter access password|sign in to your workspace/i,
    }),
  ).toBeVisible();
});
