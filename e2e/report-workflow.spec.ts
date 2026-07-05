import { expect, test } from "@playwright/test";
import {
  loginAsEngineer,
  loginAsEngineerWithResponse,
  loginAsManager,
  loginAsManagerWithResponse,
  loginAsTestUser,
} from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import {
  defineEditor,
  defineSection,
  postReviewMarginNote,
} from "./helpers/workspace";
import {
  signWorkflowAction,
  TEST_MANAGER_EMAIL,
} from "./helpers/signing";

const TEST_APPROVER_EMAIL = "test.approver@mjbiopharm.com";

test.describe.configure({ mode: "serial" });

test.describe("report workflow", () => {
  let reportId: string | null = null;
  let deviationNo: string | null = null;
  let reviewerId: string | null = null;
  let approverId: string | null = null;

  test.afterAll(async ({ browser }) => {
    if (!reportId) return;
    const page = await browser.newPage();
    await loginAsEngineer(page);
    await deleteReport(page, reportId);
    await page.close();
  });

  test("engineer submits report", async ({ page }) => {
    const reviewer = await loginAsManagerWithResponse(page);
    reviewerId = reviewer.userId;
    const approver = await loginAsTestUser(page, {
      email: TEST_APPROVER_EMAIL,
      role: "manager",
    });
    approverId = approver.userId;

    await loginAsEngineerWithResponse(page);
    const created = await createReport(page, {
      assignedManagerIds: [reviewer.userId, approver.userId],
    });
    reportId = created.id;
    deviationNo = created.deviationNo;

    await page.goto(`/reports/${reportId}/edit`);
    await signWorkflowAction(page, /submit for review/i);
    await expect(page.getByText(/submitted/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("manager sees submitted report in queue", async ({ page }) => {
    test.skip(!reportId || !deviationNo, "prior step did not create report");
    await loginAsManager(page);
    await expect(page.getByText(deviationNo!)).toBeVisible({ timeout: 15_000 });
  });

  test("manager reviews and returns feedback", async ({ page }) => {
    test.skip(!reportId, "prior step did not create report");
    await loginAsManager(page);
    await page.goto(`/reports/${reportId}/review`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByText(/submitted|in review/i).first()).toBeVisible();

    await postReviewMarginNote(
      page,
      "define",
      "Please clarify the root cause scope."
    );
    await expect(page.getByText(/comment posted/i)).toBeVisible();

    await signWorkflowAction(page, /return with feedback/i, TEST_MANAGER_EMAIL);
    await expect(page.getByText(/feedback returned to author/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(async () => {
        const res = await page.request.get(`/api/reports/${reportId}`);
        if (!res.ok()) return null;
        const { report } = (await res.json()) as { report: { status: string } };
        return report.status;
      })
      .toBe("feedback");
  });

  test("engineer resubmits after feedback", async ({ page }) => {
    test.skip(!reportId, "prior step did not create report");
    await loginAsEngineer(page);
    await page.goto(`/reports/${reportId}/edit`);
    await expect(page.getByRole("button", { name: /submit for review/i })).toBeVisible({
      timeout: 30_000,
    });
    const editor = defineEditor(page);
    await editor.click();
    await editor.type(" Updated after manager feedback.");
    await expect(defineSection(page).getByText(/saved/i)).toBeVisible({
      timeout: 30_000,
    });

    await signWorkflowAction(page, /submit for review/i);
    await expect(page.getByText(/submitted/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("manager approves report", async ({ page }) => {
    test.skip(!reportId || !approverId, "prior step did not create report");
    await loginAsTestUser(page, {
      email: TEST_APPROVER_EMAIL,
      role: "manager",
    });
    await page.goto(`/reports/${reportId}/review`);
    await signWorkflowAction(page, /^approve$/i, TEST_APPROVER_EMAIL);
    await expect(page.getByText(/approved/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("approved report is read-only for engineer", async ({ page }) => {
    test.skip(!reportId, "prior step did not create report");
    await loginAsEngineer(page);
    await page.goto(`/reports/${reportId}/edit`);
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("#define [contenteditable='true']")).toHaveCount(0);
  });
});
