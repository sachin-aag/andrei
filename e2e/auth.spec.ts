import { expect, test } from "@playwright/test";
import {
  loginAsEngineer,
  loginAsEngineerWithResponse,
  loginAsTestUser,
  logoutFromApp,
} from "./helpers/auth";

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
    await page.getByLabel(/work email/i).fill("nobody@mjbiopharm.com");
    const continueButton = page.getByRole("button", { name: /^continue$/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(
      page.getByText(/this email isn't registered/i)
    ).toBeVisible();
  });

  test("shows password step for known email with password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill("e2e.password@mjbiopharm.com");
    const continueButton = page.getByRole("button", { name: /^continue$/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });
  });

  test("shows error for wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill("e2e.password@mjbiopharm.com");
    const continueButton = page.getByRole("button", { name: /^continue$/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/^password$/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/invalid password/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("locks an account after 3 wrong password attempts", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/work email/i).fill("e2e.lockout@mjbiopharm.com");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });

    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByLabel(/^password$/i).fill("WrongPassword123!");
      await page.getByRole("button", { name: /^sign in$/i }).click();
    }

    await expect(page.getByText(/account is locked/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("logs in via test-login bypass", async ({ page }) => {
    await loginAsEngineer(page);
    await expect(page.getByText(/my reports/i)).toBeVisible();
  });

  test("shows setup password link for no-password account", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.getByLabel(/work email/i);
    await emailInput.click();
    await emailInput.fill("e2e.nopassword@mjbiopharm.com");
    const continueButton = page.getByRole("button", { name: /^continue$/i });
    await expect(continueButton).toBeEnabled({ timeout: 10_000 });
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

  test("redirects expired-password users to change password", async ({ page }) => {
    const res = await page.request.post("/api/test/login", {
      data: {
        email: "e2e.expired@mjbiopharm.com",
        passwordExpired: true,
      },
    });
    expect(res.ok()).toBeTruthy();
    await page.goto("/");
    await expect(page).toHaveURL(/\/change-password/);
    await expect(
      page.getByRole("heading", { name: /change your password/i })
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

  test("profile page exposes self-service password change", async ({ page }) => {
    await loginAsEngineer(page);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible();
    await expect(page.getByLabel(/current password/i)).toBeVisible();
    await expect(page.getByLabel(/^new password$/i)).toBeVisible();
  });

  test("password expiry warning can be ignored", async ({ page }) => {
    await loginAsTestUser(page, {
      email: "e2e.warning@mjbiopharm.com",
      passwordWarning: true,
    });
    await page.goto("/");
    await expect(page.getByText(/your password expires in/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /ignore/i }).click();
    await expect(page.getByText(/your password expires in/i)).toBeHidden();
  });

  test("logs out to login page", async ({ page }) => {
    await loginAsEngineerWithResponse(page);
    await logoutFromApp(page);
  });
});
