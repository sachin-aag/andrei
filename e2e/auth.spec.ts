import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  loginAsEngineer,
  loginAsEngineerWithResponse,
  loginAsTestUser,
  logoutFromApp,
  seedAuthUsers,
} from "./helpers/auth";

function authScope(testInfo: TestInfo): string {
  return testInfo.project.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

function scopedEmail(email: string, testInfo: TestInfo): string {
  const [local, domain] = email.split("@");
  return `${local}+${authScope(testInfo)}@${domain}`;
}

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
  test.beforeEach(async ({ page }, testInfo) => {
    await seedAuthUsers(page, { scope: authScope(testInfo) });
  });

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

  test("shows password step for known email with password", async ({ page }, testInfo) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      scopedEmail("e2e.password@mjbiopharm.com", testInfo)
    );
    await continueButton.click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });
  });

  test("shows error for wrong password", async ({ page }, testInfo) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      scopedEmail("e2e.password@mjbiopharm.com", testInfo)
    );
    await continueButton.click();
    await expect(page.getByLabel(/^password$/i)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel(/^password$/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByText(/invalid password/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("locks an account after 3 wrong password attempts", async ({ page }, testInfo) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      scopedEmail("e2e.lockout@mjbiopharm.com", testInfo)
    );
    await continueButton.click();
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

  test("shows setup password link for no-password account", async ({ page }, testInfo) => {
    await page.goto("/login");
    const continueButton = await fillEmailAndWaitForContinue(
      page,
      scopedEmail("e2e.nopassword@mjbiopharm.com", testInfo)
    );
    await continueButton.click();
    await expect(page.getByRole("link", { name: /set up a password/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("redirects must-change-password users", async ({ page }, testInfo) => {
    await loginAsTestUser(page, {
      email: scopedEmail("e2e.mustchange@mjbiopharm.com", testInfo),
      mustChangePassword: true,
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/change-password/);
    await expect(
      page.getByRole("heading", { name: /choose your password/i })
    ).toBeVisible();
  });

  test("redirects expired-password users to change password", async ({ page }, testInfo) => {
    await loginAsTestUser(page, {
      email: scopedEmail("e2e.expired@mjbiopharm.com", testInfo),
      passwordExpired: true,
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/change-password/);
    await expect(
      page.getByRole("heading", { name: /change your password/i })
    ).toBeVisible();
  });

  test("must-change-password users can switch accounts", async ({ page }, testInfo) => {
    await loginAsTestUser(page, {
      email: scopedEmail("e2e.mustchange@mjbiopharm.com", testInfo),
      mustChangePassword: true,
    });
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

  test("password expiry warning can be ignored", async ({ page }, testInfo) => {
    await loginAsTestUser(page, {
      email: scopedEmail("e2e.warning@mjbiopharm.com", testInfo),
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
