import { expect, test, type Page } from "@playwright/test";
import { gotoWithNavigationRetry } from "./helpers/navigation";
import { loginAsTestUser, scopedTestEmail } from "./helpers/auth";

function tourEmail(): string {
  const info = test.info();
  const slug = info.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  return scopedTestEmail(
    process.env.TEST_AUTH_EMAIL ?? "test.engineer@mjbiopharm.com",
    `pt-${info.project.name}-${slug}-r${info.repeatEachIndex}`
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

async function waitForWalkthroughProgress(
  page: Page,
  expected: { status: string; stepId?: string | null }
) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/me/walkthrough");
      if (!response.ok()) return null;
      const body = (await response.json()) as {
        status?: string
        stepId?: string | null
      };
      if (expected.stepId !== undefined) {
        return `${body.status ?? ""}:${body.stepId ?? ""}`;
      }
      return body.status ?? null;
    })
    .toBe(
      expected.stepId !== undefined
        ? `${expected.status}:${expected.stepId ?? ""}`
        : expected.status
    );
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
    await waitForWalkthroughProgress(page, {
      status: "in_progress",
      stepId: "reports",
    });

    await dialog.getByRole("button", { name: /^skip for now$/i }).click();
    await expect(dialog).toHaveCount(0);
    await waitForWalkthroughProgress(page, {
      status: "in_progress",
      stepId: "reports",
    });
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
    await waitForWalkthroughProgress(page, { status: "dismissed" });

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
    await expect(dialog).toHaveCount(0);
    await waitForWalkthroughProgress(page, { status: "dismissed" });

    await gotoWithNavigationRetry(page, "/profile", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /^profile$/i })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Replay product tour" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: /welcome to/i })
    ).toBeVisible({ timeout: 15_000 });
  });
});
