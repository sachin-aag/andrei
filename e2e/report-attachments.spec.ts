import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { reportSidebar } from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

test.describe("report PDF documents", () => {
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

  test("uploads a PDF, reaches ready, and opens the viewer", async ({
    page,
  }) => {
    const sidebar = reportSidebar(page);
    await sidebar.getByRole("button", { name: /^documents$/i }).click();
    await expect(page.getByText(/pdf documents/i)).toBeVisible();

    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const bytes = await pdf.save();
    const fileName = `evidence-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.pdf`;

    await page.locator('input[type="file"][accept="application/pdf"]').setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });

    await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^ready$/i).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByText(fileName).click();
    await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("iframe")).toBeVisible();
  });
});
