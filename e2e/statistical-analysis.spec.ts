import { expect, test, type Page } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { applySampleAssay } from "@/lib/statistical-analysis/sample-data";
import {
  createEmptyWorksheet,
  replaceColumnValues,
} from "@/lib/statistical-analysis/worksheet";
import {
  chatUserMessage,
  expandReportSidebar,
  openReportAnalytics,
  reportSidebar,
} from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

async function commitWorksheetCell(
  page: Page,
  cellTestId: string,
  value: string
): Promise<void> {
  await page.getByTestId(cellTestId).dblclick();
  await page.getByTestId(cellTestId).locator("input").fill(value);
  await page.keyboard.press("Enter");
}

async function openNormalSixpackDialog(page: Page): Promise<void> {
  await page.getByTestId("worksheet-stat-menu").click();
  await page.getByTestId("stat-normal-sixpack").click();
  await expect(page.getByTestId("capability-dialog")).toBeVisible();
}

const SAMPLE_MOISTURE = [
  "4.12",
  "4.08",
  "4.21",
  "3.97",
  "4.15",
  "4.09",
  "4.18",
  "4.02",
  "4.11",
  "4.25",
  "3.99",
  "4.14",
  "4.07",
  "4.19",
  "4.03",
  "4.16",
  "4.10",
  "4.22",
  "4.05",
  "4.13",
];

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
    await expect(page.getByTestId("analytics-save-status")).toHaveText("");
  });

  test("autosave settles to Saved and keeps later cell edits", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    const saveStatus = page.getByTestId("analytics-save-status");
    await expect(saveStatus).toHaveText("");

    await commitWorksheetCell(page, "cell-c1-0", "101.5");
    await expect(saveStatus).toHaveText("Saving…");
    await expect(saveStatus).toHaveText("Saved", { timeout: 10_000 });

    await commitWorksheetCell(page, "cell-c1-1", "102.1");
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.5");
    await expect(saveStatus).toHaveText("Saved", { timeout: 10_000 });
    await page.waitForTimeout(2_000);
    await expect(saveStatus).toHaveText("Saved");
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.5");
    await expect(page.getByTestId("cell-c1-1")).toHaveText("102.1");
  });

  test("loads sample assay and runs a Normal Capability Sixpack", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("worksheet-data-menu").click();
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
    await expect(page.getByTestId("sixpack-spec-label-lsl")).toHaveText("90.00");
    await expect(page.getByTestId("sixpack-spec-label-usl")).toHaveText("110.00");
    await expect(page.getByTestId("sixpack-ichart-label-ucl")).toBeVisible();
    await expect(page.getByTestId("sixpack-last25-label-ucl")).toBeVisible();
    await expect(page.getByTestId("sixpack-mr-label-ucl")).toBeVisible();
    await expect(page.getByText("Cpk")).toBeVisible();
    await expect(page.getByTestId("analysis-list")).toBeVisible();
  });

  test("saves a sixpack per column and switches between them", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    if (!reportId) throw new Error("missing report");

    let sheet = applySampleAssay(createEmptyWorksheet(), 0);
    sheet = replaceColumnValues(sheet, 1, SAMPLE_MOISTURE, "Moisture");
    const patched = await page.request.patch(
      `/api/reports/${reportId}/analytics`,
      { data: { worksheet: sheet } }
    );
    expect(patched.ok()).toBeTruthy();

    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");
    await expect(page.getByTestId("analyze-selected-column")).toHaveText(
      /analyze assay/i
    );

    await page.getByTestId("analyze-selected-column").click();
    await expect(page.getByTestId("analyze-dialog")).toBeVisible();
    await expect(page.getByTestId("analyze-plot-type")).toContainText(
      /normal capability sixpack/i
    );
    await expect(page.getByTestId("sixpack-column")).toContainText("Assay");
    await expect(page.getByTestId("sixpack-lsl")).toHaveValue("90");
    await expect(page.getByTestId("sixpack-usl")).toHaveValue("110");
    await expect(page.getByTestId("sixpack-target")).toHaveValue("100");
    await page.getByRole("dialog").getByRole("button", { name: /^ok$/i }).click();
    await expect(page.getByTestId("capability-sixpack")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/process capability sixpack of assay/i)
    ).toBeVisible();

    await page.getByTestId("workspace-tab-worksheet").click();
    await page.getByTestId("column-header-c2").click({ button: "right" });
    await expect(page.getByTestId("column-menu-c2")).toBeVisible();
    await expect(page.getByTestId("column-insert-left-c2")).toBeVisible();
    await expect(page.getByTestId("column-insert-right-c2")).toBeVisible();
    await expect(page.getByTestId("column-delete-c2")).toBeVisible();
    await expect(page.getByTestId("column-clear-c2")).toBeVisible();
    await page.getByTestId("column-analyze-c2").click();
    await expect(page.getByTestId("analyze-dialog")).toBeVisible();
    await expect(page.getByTestId("analyze-plot-type")).toContainText(
      /normal capability sixpack/i
    );
    await expect(page.getByTestId("sixpack-column")).toContainText("Moisture");
    await expect(page.getByTestId("sixpack-lsl")).toHaveValue("3.97");
    await expect(page.getByTestId("sixpack-usl")).toHaveValue("4.25");
    await expect(page.getByTestId("sixpack-target")).toHaveValue("4.11");
    await page.getByTestId("sixpack-lsl").fill("3.5");
    await page.getByTestId("sixpack-usl").fill("4.5");
    await page.getByTestId("sixpack-target").fill("4");
    await page.getByRole("dialog").getByRole("button", { name: /^ok$/i }).click();
    await expect(
      page.getByText(/process capability sixpack of moisture/i)
    ).toBeVisible({ timeout: 30_000 });

    const list = page.getByTestId("analysis-list");
    await expect(list.locator("[data-analysis-title]")).toHaveCount(2);
    await list.locator("[data-analysis-title='Assay']").click();
    await expect(
      page.getByText(/process capability sixpack of assay/i)
    ).toBeVisible();
    await list.locator("[data-analysis-title='Moisture']").click();
    await expect(
      page.getByText(/process capability sixpack of moisture/i)
    ).toBeVisible();
  });

  test("shift+arrow selects rows and runs a sixpack on that range", async ({
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

    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("cell-c1-0").click();
    await page.getByTestId("worksheet-grid").focus();
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press("Shift+ArrowDown");
    }
    await expect(page.getByTestId("worksheet-grid")).toHaveAttribute(
      "data-row-start",
      "0"
    );
    await expect(page.getByTestId("worksheet-grid")).toHaveAttribute(
      "data-row-end",
      "9"
    );
    await expect(page.getByTestId("analyze-selected-column")).toHaveText(
      /analyze assay rows 1–10/i
    );

    await page.getByTestId("analyze-selected-column").click();
    await expect(page.getByTestId("analyze-dialog")).toBeVisible();
    await expect(page.getByTestId("sixpack-row-start")).toHaveValue("1");
    await expect(page.getByTestId("sixpack-row-end")).toHaveValue("10");
    await page.getByTestId("sixpack-lsl").fill("90");
    await page.getByTestId("sixpack-usl").fill("110");
    await page.getByTestId("sixpack-target").fill("100");
    await page.getByRole("dialog").getByRole("button", { name: /^ok$/i }).click();

    await expect(page.getByTestId("capability-sixpack")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("sixpack-sample-n")).toHaveText("10");
    await expect(page.getByTestId("sixpack-row-range")).toContainText(
      "rows 1–10"
    );
  });

  test("saves a sixpack for specific row numbers", async ({ page }) => {
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
          lsl: 90,
          usl: 110,
          target: 100,
          rows: [1, 3, 5, 8, 12],
        },
      }
    );
    expect(analyzed.ok()).toBeTruthy();
    const body = (await analyzed.json()) as {
      analysis: { results: { n: number } };
    };
    expect(body.analysis.results.n).toBe(5);

    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("workspace-tab-results").click();
    await expect(page.getByTestId("capability-sixpack")).toBeVisible();
    await expect(page.getByTestId("sixpack-sample-n")).toHaveText("5");
    await expect(page.getByTestId("sixpack-row-range")).toContainText(
      "rows 1, 3, 5, 8, 12"
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-analysis").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/capability-sixpack\.csv$/);
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
    await expect(sidebar.getByTestId("analytics-chat-mode")).toBeVisible();
    await expect(sidebar.getByTestId("analytics-chat-pace")).toBeVisible();
    await expect(sidebar.getByTestId("analytics-chat-attach-image")).toBeVisible();
    await composer.fill("extract assay numbers from the attachments");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();
    await expect(
      chatUserMessage(page, "extract assay numbers from the attachments")
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      sidebar.getByText(/normal capability sixpack/i)
    ).toBeVisible({ timeout: 30_000 });
  });

  test("shows Data sheets and column specs from the header menu", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("worksheet-sheet-tab-data-1")).toHaveText("Data");
    await expect(page.getByTestId("worksheet-sheet-tab-specs")).toHaveCount(0);

    await page.getByTestId("worksheet-data-menu").click();
    await expect(page.getByRole("menuitem", { name: "Insert column" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "Insert row" })).toHaveCount(0);
    await page.getByTestId("load-sample-assay").click();
    await page.getByTestId("column-header-c1").click({ button: "right" });
    await page.getByTestId("column-specs-c1").click();
    await expect(page.getByTestId("column-specs-dialog")).toBeVisible();
    await expect(page.getByTestId("column-spec-lsl")).toHaveValue("90");
    await expect(page.getByTestId("column-spec-usl")).toHaveValue("110");
    await expect(page.getByTestId("column-spec-target")).toHaveValue("100");
    await page.getByTestId("column-specs-save").click();
    await expect(page.getByTestId("column-specs-dialog")).toHaveCount(0);

    await page.getByTestId("worksheet-stat-menu").click();
    await page.getByTestId("stat-plot-measurements").click();
    await expect(page.getByTestId("plot-measurements-dialog")).toBeVisible();
    await expect(page.getByTestId("plot-measurements-submit")).toBeDisabled();
    await expect(page.getByTestId("plot-lsl")).toHaveValue("");
    await expect(page.getByTestId("plot-usl")).toHaveValue("");
    await page.getByTestId("plot-query").fill("M3-SYS-FN-037");
    await page.getByTestId("plot-lsl").fill("1");
    await page.getByTestId("plot-usl").fill("6");
    await page.getByTestId("plot-measurements-submit").click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  });

  test("row headers select the whole row and the row menu inserts, clears, and deletes", async ({
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

    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.84");
    const second = await page.getByTestId("cell-c1-1").innerText();

    await page.getByTestId("row-header-0").click();
    await expect(page.getByTestId("worksheet-grid")).toHaveAttribute(
      "data-selection-axis",
      "row"
    );
    await expect(page.getByTestId("cell-c1-0")).toHaveAttribute(
      "data-in-selection",
      "true"
    );
    await expect(page.getByTestId("cell-c2-0")).toHaveAttribute(
      "data-in-selection",
      "true"
    );

    await page.getByTestId("row-header-0").click({ button: "right" });
    await expect(page.getByTestId("row-menu-0")).toBeVisible();
    await expect(page.getByTestId("row-insert-above-0")).toBeVisible();
    await expect(page.getByTestId("row-insert-below-0")).toBeVisible();
    await expect(page.getByTestId("row-clear-0")).toBeVisible();
    await expect(page.getByTestId("row-delete-0")).toBeVisible();
    await page.getByTestId("row-insert-above-0").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("");
    await expect(page.getByTestId("cell-c1-1")).toHaveText("101.84");

    await page.getByTestId("row-header-0").click({ button: "right" });
    await page.getByTestId("row-delete-0").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.84");

    await page.getByTestId("row-header-0").click({ button: "right" });
    await page.getByTestId("row-insert-below-0").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.84");
    await expect(page.getByTestId("cell-c1-1")).toHaveText("");
    await expect(page.getByTestId("cell-c1-2")).toHaveText(second);

    await page.getByTestId("row-header-0").click({ button: "right" });
    await page.getByTestId("row-clear-0").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("");
    await expect(page.getByTestId("cell-c1-2")).toHaveText(second);
  });

  test("column context menu inserts, clears, and opens Analyze with prefilled plot values", async ({
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

    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.84");

    await page.getByTestId("column-header-c1").click({ button: "right" });
    await expect(page.getByTestId("column-menu-c1")).toBeVisible();
    await expect(page.getByTestId("column-insert-left-c1")).toBeVisible();
    await expect(page.getByTestId("column-insert-right-c1")).toBeVisible();
    await expect(page.getByTestId("column-delete-c1")).toBeVisible();
    await expect(page.getByTestId("column-clear-c1")).toBeVisible();
    await page.getByTestId("column-analyze-c1").click();
    await expect(page.getByTestId("analyze-dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /analyze data/i })).toBeVisible();
    await expect(page.getByTestId("analyze-plot-type")).toContainText(
      /normal capability sixpack/i
    );
    await expect(page.getByTestId("sixpack-column")).toContainText("Assay");
    await expect(page.getByTestId("sixpack-lsl")).toHaveValue("90");
    await expect(page.getByTestId("sixpack-usl")).toHaveValue("110");
    await expect(page.getByTestId("sixpack-target")).toHaveValue("100");

    await page.getByTestId("analyze-plot-type").click();
    await page.getByRole("option", { name: /one-way anova/i }).click();
    await expect(page.getByTestId("anova-response")).toContainText("Assay");
    await expect(page.getByTestId("anova-factor")).toContainText("Lot");

    await page.getByTestId("analyze-plot-type").click();
    await page.getByRole("option", { name: /plot measurements/i }).click();
    await expect(page.getByTestId("plot-query")).toHaveValue("Assay");
    await expect(page.getByTestId("plot-lsl")).toHaveValue("90");
    await expect(page.getByTestId("plot-usl")).toHaveValue("110");
    await page.getByRole("dialog").getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByTestId("analyze-dialog")).toHaveCount(0);

    await page.getByTestId("column-header-c1").click({ button: "right" });
    await page.getByTestId("column-insert-left-c1").click();
    await expect(page.getByTestId("column-header-c9")).toHaveText("C1");
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");

    await page.getByTestId("column-header-c1").click({ button: "right" });
    await page.getByTestId("column-insert-right-c1").click();
    await expect(page.getByTestId("column-header-c10")).toBeVisible();

    await page.getByTestId("column-header-c9").click({ button: "right" });
    await page.getByTestId("column-delete-c9").click();
    await expect(page.getByTestId("column-header-c9")).toHaveCount(0);

    await page.getByTestId("column-header-c1").click({ button: "right" });
    await page.getByTestId("column-clear-c1").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("");
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");
  });

  test("loads sample assay and runs one-way ANOVA of Assay by Lot", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await openReportAnalytics(page);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("worksheet-data-menu").click();
    await page.getByTestId("load-sample-assay").click();
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");
    await expect(page.getByTestId("column-header-c2")).toHaveText("Lot");

    await page.getByTestId("worksheet-stat-menu").click();
    await page.getByTestId("stat-one-way-anova").click();
    await expect(page.getByTestId("anova-dialog")).toBeVisible();
    await expect(page.getByTestId("anova-response")).toContainText("Assay");
    await expect(page.getByTestId("anova-factor")).toContainText("Lot");
    await page.getByRole("dialog").getByRole("button", { name: /^ok$/i }).click();

    await expect(page.getByTestId("one-way-anova")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("anova-interval-plot")).toBeVisible();
    await expect(page.getByTestId("anova-f")).not.toHaveText("");
    await expect(page.getByTestId("anova-p")).toBeVisible();
    await expect(
      page.getByText(/one-way anova: assay versus lot/i)
    ).toBeVisible();
  });
});
