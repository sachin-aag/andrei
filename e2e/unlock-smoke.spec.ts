import { expect, test } from "@playwright/test";

test("auth entry page renders", async ({ page }) => {
  await page.goto("/unlock");

  // Without SITE_ACCESS_PASSWORD: /unlock → /login, which renders LoginForm as
  // an always-open aria-modal Dialog. The h1 behind it is inaccessible, so
  // Playwright sees the dialog title "Select user" instead.
  await expect(
    page.getByRole("heading", {
      name: /enter access password|sign in to your workspace|select user/i,
    }),
  ).toBeVisible({ timeout: 30_000 });
});
