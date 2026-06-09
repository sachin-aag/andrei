import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";

test.describe("docx export", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("export triggers docx download", async ({ page }) => {
    await page.goto(`/reports/${reportId}/edit`);
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /export docx/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.docx$/i);
  });

});

test("export returns 404 for missing report", async ({ page }) => {
  await loginAsEngineer(page);
  const res = await page.request.get("/api/reports/nonexistent-report-id/export");
  expect(res.status()).toBe(404);
});
