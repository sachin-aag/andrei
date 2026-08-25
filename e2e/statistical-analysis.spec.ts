import { expect, test, type Page } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { applySampleAssay } from "@/lib/statistical-analysis/sample-data";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";
import {
  chatUserMessage,
  expandReportSidebar,
  openReportAnalytics,
  reportSidebar,
} from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

async function openNormalSixpackDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Stat" }).click();
  await page.getByTestId("stat-normal-sixpack").click();
  await expect(page.getByTestId("capability-dialog")).toBeVisible();
}

test.describe("report analytics", () => {
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
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("opens the Analytics tab with an empty worksheet", async ({ page }) => {
    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^define$/i })).toHaveCount(0);
  });

  test("loads sample assay and runs a Normal Capability Sixpack", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Data" }).click();
    await page.getByTestId("load-sample-assay").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.84");
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");

    await openNormalSixpackDialog(page);
    await page.getByTestId("sixpack-lsl").fill("90");
    await page.getByTestId("sixpack-usl").fill("110");
    await page.getByTestId("sixpack-target").fill("100");
    await page.getByRole("dialog").getByRole("button", { name: /^ok$/i }).click();

    await expect(page.getByTestId("capability-sixpack")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/process capability sixpack of assay/i)
    ).toBeVisible();
    await expect(page.getByText("Cpk")).toBeVisible();
    await expect(page.getByTestId("analysis-list")).toBeVisible();
  });

  test("marks a sixpack stale after the source column changes", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    if (!reportId) throw new Error("missing report");
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);

    const patched = await page.request.patch(
      `/api/reports/${reportId}/analytics`,
      { data: { worksheet: sheet } }
    );
    expect(patched.ok()).toBeTruthy();

    const analyzed = await page.request.post(
      `/api/reports/${reportId}/analytics/analyses`,
      {
        data: {
          columnId: "c1",
          title: "Assay",
          lsl: 90,
          usl: 110,
          target: 100,
        },
      }
    );
    expect(analyzed.ok()).toBeTruthy();

    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("workspace-tab-results").click();
    await expect(page.getByTestId("capability-sixpack")).toBeVisible();
    await expect(page.getByTestId("sixpack-stale-badge")).toHaveCount(0);

    await page.getByTestId("workspace-tab-worksheet").click();
    await page.getByTestId("cell-c1-0").click();
    await page.keyboard.type("99.00");
    await page.keyboard.press("Enter");

    await page.getByTestId("workspace-tab-results").click();
    await expect(page.getByTestId("sixpack-stale-badge")).toBeVisible();
    await page.getByRole("button", { name: /^recompute$/i }).click();
    await expect(page.getByTestId("sixpack-stale-badge")).toHaveCount(0, {
      timeout: 30_000,
    });
  });

  test("streams a stats-assistant reply", async ({ page }) => {
    test.setTimeout(90_000);
    await openReportAnalytics(page);
    await expandReportSidebar(page);
    const sidebar = reportSidebar(page);
    const composer = sidebar.getByTestId("analytics-chat-input");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("extract assay numbers from the attachments");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();
    await expect(
      chatUserMessage(page, "extract assay numbers from the attachments")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      sidebar.getByText(/normal capability sixpack/i)
    ).toBeVisible({ timeout: 30_000 });
  });
});
