import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import PizZip from "pizzip";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { documentsPanel, expandDocumentsPanel } from "./helpers/workspace";

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
    await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible({
      timeout: 15_000,
    });
    // PDFs paint to a canvas (Chrome/Comet block application/pdf iframes).
    await expect(page.getByLabel(`${fileName}, page 1`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(`iframe[title="${fileName}"]`)).toHaveCount(0);
  });

  test("renders later PDF pages in a scrollable preview", async ({ page }) => {
    const fileName = await uploadPdf(page, 3);
    const panel = documentsPanel(page);

    await expect(
      panel.locator('[data-document-file][data-status="ready"]')
    ).toBeVisible({ timeout: 30_000 });

    await panel.getByRole("button", { name: fileName, exact: true }).click();
    await expect(page.getByRole("button", { name: /^back$/i })).toBeVisible({
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

  test("download all stays hidden until a document is stored", async ({ page }) => {
    const panel = documentsPanel(page);
    await expect(
      panel.getByRole("button", { name: /upload pdf or word document/i })
    ).toBeVisible();
    await expect(panel.getByRole("link", { name: /^download all$/i })).toHaveCount(
      0
    );
  });

  test("download all zips every stored document", async ({ page }) => {
    const fileA = await uploadPdf(page, 1);
    const fileB = await uploadPdf(page, 2);
    const panel = documentsPanel(page);

    await expect(
      panel.locator('[data-document-file][data-status="ready"]')
    ).toHaveCount(2, { timeout: 30_000 });

    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("link", { name: /^download all$/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^Attachments_.+\.zip$/i);

    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    const zip = new PizZip(await readFile(savedPath!));
    const names = Object.keys(zip.files).filter((name) => !name.endsWith("/"));
    expect(names.sort()).toEqual([fileA, fileB].sort());
  });
});
