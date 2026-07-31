import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { documentsPanel, expandDocumentsPanel } from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

async function uploadPdf(page: Page): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const bytes = await pdf.save();
  const fileName = `evidence-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.pdf`;

  await documentsPanel(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: Buffer.from(bytes),
    });

  await expect(page.getByText(fileName)).toBeVisible({ timeout: 30_000 });
  return fileName;
}

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
    await expandDocumentsPanel(page);
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("uploads a PDF, reaches ready, and opens the viewer", async ({ page }) => {
    const fileName = await uploadPdf(page);

    await expect(
      documentsPanel(page).locator('[data-document-file][data-status="ready"]')
    ).toBeVisible({ timeout: 30_000 });

    await page.getByText(fileName).click();
    await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("iframe")).toBeVisible();
  });

  test("creates a folder and keeps it after reload", async ({ page }) => {
    const panel = documentsPanel(page);
    await panel.getByRole("button", { name: /^new folder$/i }).click();

    const nameField = panel.getByLabel(/folder name/i);
    await nameField.fill("Batch Records");
    await nameField.press("Enter");

    await expect(panel.getByText("Batch Records")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expandDocumentsPanel(page);
    await expect(documentsPanel(page).getByText("Batch Records")).toBeVisible({
      timeout: 15_000,
    });
  });
});
