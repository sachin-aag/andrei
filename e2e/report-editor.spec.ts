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
  collapseReportSidebar,
  collapseWorkProductPanel,
  defineEditor,
  defineSection,
  documentsPanel,
  expandDocumentsPanel,
  expandReportSidebar,
  expandWorkProductPanel,
  expectDocumentPanelResizeHandleAligned,
  openReportAnalytics,
  openReportEditor,
  reportSidebar,
  reviewMargin,
  setReportChrome,
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
    await openReportEditor(page, reportId);
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

  test("hides the review margin until Comments is enabled and the assistant is collapsed", async ({
    page,
  }) => {
    // Wide enough that the main canvas would otherwise show both surfaces.
    await page.setViewportSize({ width: 1920, height: 900 });
    await expect(
      reportSidebar(page).getByRole("button", { name: /collapse sidebar/i })
    ).toBeVisible();
    await expect(reviewMargin(page)).toHaveCount(0);

    await collapseReportSidebar(page);
    await expect(reviewMargin(page)).toHaveCount(0);

    await page.getByRole("switch", { name: /comments/i }).click();
    await expect(reviewMargin(page)).toBeVisible();

    await page.getByRole("switch", { name: /comments/i }).click();
    await expect(reviewMargin(page)).toHaveCount(0);

    await page.getByRole("switch", { name: /comments/i }).click();
    await expect(reviewMargin(page)).toBeVisible();

    await expandReportSidebar(page);
    await expect(reviewMargin(page)).toHaveCount(0);
  });

  test("resizes the assistant and documents panels from the keyboard", async ({
    page,
  }) => {
    const chatHandle = page.getByRole("separator", {
      name: /resize assistant panel/i,
    });
    const docsHandle = page.getByRole("separator", {
      name: /resize documents panel/i,
    });
    await expect(chatHandle).toBeVisible();
    await expect(docsHandle).toBeVisible();

    const sidebar = reportSidebar(page);
    const documents = page.getByRole("complementary", { name: "Documents" });
    const chatBefore = await sidebar.evaluate((el) => el.getBoundingClientRect().width);
    const docsBefore = await documents.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    await chatHandle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => sidebar.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(chatBefore);

    await docsHandle.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () =>
        documents.evaluate((el) => el.getBoundingClientRect().width)
      )
      .toBeGreaterThan(docsBefore);

    await sidebar.getByRole("button", { name: /collapse sidebar/i }).click();
    await expect(chatHandle).toHaveCount(0);
  });

  test("opens the assistant at the default width on a new report and after reload", async ({
    page,
  }) => {
    const sidebar = reportSidebar(page);
    const chatHandle = page.getByRole("separator", {
      name: /resize assistant panel/i,
    });
    const defaultWidth = await sidebar.evaluate(
      (el) => el.getBoundingClientRect().width
    );

    await chatHandle.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => sidebar.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(defaultWidth + 8);

    const other = await createReport(page);
    try {
      await gotoWithNavigationRetry(page, `/reports/${other.id}/edit`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(async () => {
          const width = await sidebar.evaluate(
            (el) => el.getBoundingClientRect().width
          );
          return Math.abs(width - defaultWidth);
        })
        .toBeLessThan(12);

      await chatHandle.focus();
      await page.keyboard.press("ArrowLeft");
      await expect
        .poll(async () =>
          sidebar.evaluate((el) => el.getBoundingClientRect().width)
        )
        .toBeGreaterThan(defaultWidth + 4);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(async () => {
          const width = await reportSidebar(page).evaluate(
            (el) => el.getBoundingClientRect().width
          );
          return Math.abs(width - defaultWidth);
        })
        .toBeLessThan(12);
    } finally {
      await deleteReport(page, other.id);
    }
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

  test("Agent chrome puts chat in the center and work product on the right", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await expandDocumentsPanel(page);
    await expandReportSidebar(page);
    await setReportChrome(page, "agent");

    const collapsedPanel = page.getByTestId("report-work-product");
    await expect(
      collapsedPanel.getByRole("button", { name: /expand document panel/i })
    ).toBeVisible();
    const collapsedBox = await collapsedPanel.boundingBox();
    expect(collapsedBox).toBeTruthy();
    expect(collapsedBox!.width).toBeLessThanOrEqual(52);

    const previewHandle = page.getByRole("separator", {
      name: /resize document panel/i,
    });
    await expectDocumentPanelResizeHandleAligned(page);

    await expandWorkProductPanel(page);
    await expect(page.getByRole("switch", { name: /comments/i })).toHaveCount(0);

    const docsBox = await documentsPanel(page).boundingBox();
    const chatBox = await reportSidebar(page).boundingBox();
    const canvasBox = await page.getByTestId("report-work-product").boundingBox();
    expect(docsBox).toBeTruthy();
    expect(chatBox).toBeTruthy();
    expect(canvasBox).toBeTruthy();
    expect(docsBox!.x).toBeLessThan(chatBox!.x);
    expect(chatBox!.x).toBeLessThan(canvasBox!.x);

    await expectDocumentPanelResizeHandleAligned(page);
    const widthBefore = await page
      .getByTestId("report-work-product")
      .evaluate((el) => el.getBoundingClientRect().width);
    await previewHandle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () =>
        page
          .getByTestId("report-work-product")
          .evaluate((el) => el.getBoundingClientRect().width)
      )
      .toBeGreaterThan(widthBefore);

    await openReportAnalytics(page);
    await expect(page.getByTestId("analytics-revision-history")).toBeVisible();
    const analytics = page.getByTestId("report-analytics-workspace");
    await expect(analytics).toBeVisible();
    const analyticsBox = await analytics.boundingBox();
    const chatAfter = await reportSidebar(page).boundingBox();
    expect(analyticsBox).toBeTruthy();
    expect(chatAfter).toBeTruthy();
    expect(chatAfter!.x).toBeLessThan(analyticsBox!.x);

    await setReportChrome(page, "document");
    const canvasAfter = await page.getByTestId("report-work-product").boundingBox();
    const chatRight = await reportSidebar(page).boundingBox();
    expect(canvasAfter).toBeTruthy();
    expect(chatRight).toBeTruthy();
    expect(canvasAfter!.x).toBeLessThan(chatRight!.x);

    await setReportChrome(page, "agent");
    await expandWorkProductPanel(page);
    await expect(page.getByTestId("analytics-revision-history")).toBeVisible();
    await page.getByTestId("report-surface-document").click();
    await page.getByTestId("document-revision-history").click();
    await expect(
      page.getByText(
        "Versions appear after you edit the document or the assistant writes to it."
      )
    ).toBeVisible();

    await collapseWorkProductPanel(page);
    await expect(collapsedPanel.getByRole("button", { name: /expand document panel/i })).toBeVisible();
    // Collapsed Agent rail only shows the active tab. Expand to reach Analytics.
    await expandWorkProductPanel(page);
    await page.getByTestId("report-surface-analytics").click();
    await expect(page.getByTestId("report-analytics-workspace")).toBeVisible({
      timeout: 30_000,
    });
  });
});
