import { expect, test } from "@playwright/test";
import {
  loginAsAdminWithResponse,
  loginAsEngineerWithResponse,
  loginAsManagerWithResponse,
} from "./helpers/auth";
import { gotoWithNavigationRetry } from "./helpers/navigation";
import { createReport, deleteReport } from "./helpers/reports";
import { signedWorkflowPayload } from "./helpers/signing";

test.describe.configure({ mode: "serial" });

test.describe("admin reports view", () => {
  let reportId: string | null = null;
  let deviationNo: string | null = null;
  let managerId: string | null = null;

  test.afterAll(async ({ browser }) => {
    if (!reportId) return;
    const page = await browser.newPage();
    await loginAsEngineerWithResponse(page);
    await deleteReport(page, reportId);
    await page.close();
  });

  test("admin can browse reports by user and open read-only view", async ({
    page,
  }) => {
    const manager = await loginAsManagerWithResponse(page);
    managerId = manager.userId;

    const engineer = await loginAsEngineerWithResponse(page);

    const created = await createReport(page, { assignedManagerId: managerId });
    reportId = created.id;
    deviationNo = created.deviationNo;

    const submitRes = await page.request.post(`/api/reports/${reportId}/submit`, {
      data: signedWorkflowPayload(),
    });
    expect(submitRes.ok(), `submit failed (${submitRes.status()})`).toBeTruthy();

    await loginAsAdminWithResponse(page);
    await gotoWithNavigationRetry(page, "/admin/reports", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^reports$/i })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /all users/i }).click();
    await page.getByPlaceholder(/search by name, email, or role/i).fill(engineer.email);
    await page.getByRole("option", { name: new RegExp(engineer.email, "i") }).click();

    await expect(page.getByText(deviationNo!)).toBeVisible({ timeout: 15_000 });

    await gotoWithNavigationRetry(page, `/admin/reports/${reportId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator("header").getByRole("link", { name: /admin reports/i })
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(deviationNo!)).toBeVisible();
    await expect(page.locator("#define [contenteditable='true']")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /submit for review/i })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /run criteria/i })).toHaveCount(0);
  });

  test("admin report entry redirects from /reports/[id]", async ({ page }) => {
    test.skip(!reportId || !deviationNo, "prior step did not create report");
    await loginAsAdminWithResponse(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(new RegExp(`/admin/reports/${reportId}$`));
    await expect(page.getByText(deviationNo!)).toBeVisible({ timeout: 30_000 });
  });
});
