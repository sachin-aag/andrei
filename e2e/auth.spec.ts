import { expect, test, type Page } from "@playwright/test";
import {
  loginAsEngineer,
  loginAsEngineerWithResponse,
  logoutFromApp,
} from "./helpers/auth";

async function fillEmailAndWaitForContinue(page: Page, email: string) {
  const emailInput = page.getByLabel(/work email/i);
  await expect(emailInput).toBeEditable({ timeout: 15_000 });
  await emailInput.fill("");
  await emailInput.pressSequentially(email);
  await expect(emailInput).toHaveValue(email, { timeout: 10_000 });
  const continueButton = page.getByRole("button", { name: /^continue$/i });
  await expect(continueButton).toBeEnabled({ timeout: 15_000 });
  return continueButton;
}

test.describe.configure({ mode: "serial" });

test.describe("authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /sign in to your workspace/i })
    ).toBeVisible();
    await expect(page.getByLabel(/work email/i)).toBeVisible();
  });

  test("shows error for unknown email", async ({ page }) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      "nobody@mjbiopharm.com"
    );
    const checkEmailResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/check-email") &&
        response.request().method() === "POST"
    );
    await continueButton.click();
    await expect((await checkEmailResponse).ok()).toBeTruthy();
    await expect(
      page.getByText(/this email isn't registered/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("shows password step for known email with password", async ({ page }) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      "e2e.password@mjbiopharm.com"
    );
    await continueButton.click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      "e2e.password@mjbiopharm.com"
    );
    await continueButton.click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/^password$/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/invalid password/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("logs in via test-login bypass", async ({ page }) => {
    await loginAsEngineer(page);
    await expect(page.getByText(/my reports/i)).toBeVisible();
  });

  test("shows setup password link for no-password account", async ({ page }) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      "e2e.nopassword@mjbiopharm.com"
    );
    await continueButton.click();
    await expect(page.getByRole("link", { name: /set up a password/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("redirects must-change-password users", async ({ page }) => {
    const res = await page.request.post("/api/test/login", {
      data: {
        email: "e2e.mustchange@mjbiopharm.com",
        mustChangePassword: true,
      },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto("/");
    await expect(page).toHaveURL(/\/change-password/);
    await expect(
      page.getByRole("heading", { name: /choose your password/i })
    ).toBeVisible();
  });

  test("must-change-password users can switch accounts", async ({ page }) => {
    const res = await page.request.post("/api/test/login", {
      data: {
        email: "e2e.mustchange@mjbiopharm.com",
        mustChangePassword: true,
      },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto("/change-password");
    await page
      .getByRole("button", { name: /use a different account/i })
      .click();
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: /sign in to your workspace/i })
    ).toBeVisible();
  });

  test("forgot password page renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByLabel(/work email/i)).toBeVisible();
  });

  test("logs out to login page", async ({ page }) => {
    await loginAsEngineerWithResponse(page);
    await logoutFromApp(page);
  });
});
