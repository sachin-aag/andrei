import { expect, test } from "@playwright/test";
import {
  authenticateAsEngineer,
  authenticateAsManager,
  loginAsEngineer,
} from "./helpers/auth";
import { browserCookieHeaders } from "./helpers/api";
import { gotoWithNavigationRetry } from "./helpers/navigation";
import {
  createReport,
  deleteReport,
  seedDefineForEvaluation,
} from "./helpers/reports";
import {
  defineEditor,
  defineSection,
  reportSidebar,
} from "./helpers/workspace";
import {
  signedWorkflowPayload,
  TEST_MANAGER_EMAIL,
} from "./helpers/signing";

test.describe.configure({ mode: "serial" });

test.describe("report editor", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
    await page.goto(`/reports/${reportId}/edit`);
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await authenticateAsEngineer(page);
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("shows all DMAIC and structural sections", async ({ page }) => {
    for (const title of ["Define", "Measure", "Analyze", "Improve", "Control"]) {
      await expect(
        page.getByRole("heading", { name: new RegExp(`^${title}$`, "i") })
      ).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: /documents reviewed/i })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /^attachments$/i })).toBeVisible();
    // Blank reports omit signature approvals until a DOCX with that table is imported.
    await expect(
      page.getByRole("heading", { name: /approvals \(qc \/ qa\)/i })
    ).toHaveCount(0);
  });

  test("typing triggers auto-save status", async ({ page }) => {
    const editor = defineEditor(page);
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await editor.pressSequentially(" Additional investigation detail for auto-save.");
    const define = defineSection(page);
    await expect(define.getByText(/saving/i)).toBeVisible({ timeout: 15_000 });
    await expect(define.getByText(/saved/i)).toBeVisible({ timeout: 30_000 });
  });

  test("sidebar tabs switch panels", async ({ page }) => {
    const sidebar = reportSidebar(page);
    await sidebar.getByRole("button", { name: /^placeholders$/i }).click();
    await expect(
      page.getByText(/you're all caught up|no placeholders found/i).first()
    ).toBeVisible();

    await seedDefineForEvaluation(page, reportId!);
    const evalRes = await page.request.post(`/api/reports/${reportId}/evaluate`, {
      data: {},
      headers: await browserCookieHeaders(page),
    });
    expect(evalRes.ok()).toBeTruthy();

    await sidebar.getByRole("button", { name: /^criteria$/i }).click();
    await expect(page.getByText(/clearly define what happened actually/i)).toBeVisible({
      timeout: 15_000,
    });

    await sidebar.getByRole("button", { name: /^comments$/i }).click();
    await expect(page.getByText(/no comments yet|comment/i).first()).toBeVisible();
  });

  test("collapses and expands sidebar", async ({ page }) => {
    const sidebar = reportSidebar(page);
    await sidebar.getByRole("button", { name: /collapse sidebar/i }).click();
    await expect(sidebar.getByRole("button", { name: /expand sidebar/i })).toBeVisible();
    await sidebar.getByRole("button", { name: /expand sidebar/i }).click();
    await expect(sidebar.getByRole("button", { name: /collapse sidebar/i })).toBeVisible();
  });

  test("approved report is read-only for engineer", async ({ page }) => {
    const submitRes = await page.request.post(`/api/reports/${reportId}/submit`, {
      data: signedWorkflowPayload(),
      headers: await browserCookieHeaders(page),
    });
    expect(submitRes.ok(), `submit failed (${submitRes.status()})`).toBeTruthy();

    await authenticateAsManager(page);
    const approveRes = await page.request.post(`/api/reports/${reportId}/approve`, {
      data: signedWorkflowPayload(TEST_MANAGER_EMAIL),
      headers: await browserCookieHeaders(page),
    });
    expect(approveRes.ok(), `approve failed (${approveRes.status()})`).toBeTruthy();

    await authenticateAsEngineer(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: /submit for review/i })).toHaveCount(0);
    await expect(page.locator("#define [contenteditable='true']")).toHaveCount(0);
  });
});
