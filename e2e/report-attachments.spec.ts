import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { documentsPanel, expandDocumentsPanel, setReportChrome } from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

async function uploadPdf(page: Page, pageCount = 1): Promise<string> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([612, 792]);
  }
  const bytes = await pdf.save();
  const fileName = `evidence-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.pdf`;

  const panel = documentsPanel(page);
  const fileInput = panel.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  const uploadUrlResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/attachments/upload-url") &&
      response.request().method() === "POST",
    { timeout: 30_000 }
  );

  await fileInput.setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });

  const reservation = await uploadUrlResponse;
  expect(
    reservation.ok(),
    `upload-url failed: ${reservation.status()} ${await reservation.text()}`
  ).toBe(true);

  await expect(panel.getByText(fileName)).toBeVisible({ timeout: 30_000 });
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
    const panel = documentsPanel(page);

    await expect(
      panel.locator('[data-document-file][data-status="ready"]')
    ).toBeVisible({ timeout: 30_000 });

    // Scope to the Documents panel — a success toast also contains the filename.
    await panel.getByRole("button", { name: fileName, exact: true }).click();
    await expect(page.getByRole("button", { name: /back to report/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeHidden();
    await expect(page.getByRole("toolbar", { name: "Editing" })).toBeHidden();
    // PDFs paint to a canvas (Chrome/Comet block application/pdf iframes).
    await expect(page.getByLabel(`${fileName}, page 1`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(`iframe[title="${fileName}"]`)).toHaveCount(0);

    await page.getByRole("button", { name: /back to report/i }).click();
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible();
    await expect(page.getByTestId("attachment-viewer")).toHaveCount(0);
  });

  test("agent chrome expands the work product panel when a PDF is opened", async ({
    page,
  }) => {
    await setReportChrome(page, "agent");
    const workProduct = page.getByTestId("report-work-product");
    await expect(
      workProduct.getByRole("button", { name: /expand document panel/i })
    ).toBeVisible();

    const fileName = await uploadPdf(page);
    const panel = documentsPanel(page);
    await expect(
      panel.locator('[data-document-file][data-status="ready"]')
    ).toBeVisible({ timeout: 30_000 });

    await panel.getByRole("button", { name: fileName, exact: true }).click();
    await expect(
      workProduct.getByRole("button", { name: /collapse document panel/i })
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /back to report/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("renders later PDF pages in a scrollable preview", async ({ page }) => {
    const fileName = await uploadPdf(page, 3);
    const panel = documentsPanel(page);

    await expect(
      panel.locator('[data-document-file][data-status="ready"]')
    ).toBeVisible({ timeout: 30_000 });

    await panel.getByRole("button", { name: fileName, exact: true }).click();
    await expect(page.getByRole("button", { name: /back to report/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel(`${fileName}, page 1`)).toBeVisible({
      timeout: 15_000,
    });

    await page.locator('[data-pdf-page="3"]').scrollIntoViewIfNeeded();
    await expect(page.getByLabel(`${fileName}, page 3`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Page 3 of 3/)).toBeVisible();
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
