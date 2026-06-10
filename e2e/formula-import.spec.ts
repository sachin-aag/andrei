import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { newReportButton } from "./helpers/reports";

const fixturePath = path.join(
  process.cwd(),
  "docs",
  "Draft Investigation (DEV-QC-26-001).docx"
);

test.describe("legacy equation formula rendering", () => {
  test.skip(!fs.existsSync(fixturePath), "Draft Investigation fixture missing");

  let createdReportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsEngineer(page);
    const res = await page.request.get("/api/reports");
    if (!res.ok()) return;
    const { reports: existing } = (await res.json()) as {
      reports: Array<{ id: string; deviationNo: string }>;
    };
    for (const r of existing) {
      if (r.deviationNo === "DEV/QC/26/001") {
        await page.request.delete(`/api/reports/${r.id}`);
      }
    }
  });

  test.afterEach(async ({ page }) => {
    if (!createdReportId) return;
    await page.request.delete(`/api/reports/${createdReportId}`);
    createdReportId = null;
  });

  test("imports DOCX formulas as visible inline images in the editor", async ({ page }) => {
    test.setTimeout(120_000);

    await newReportButton(page).click();
    await page.locator("#report-upload").setInputFiles(fixturePath);
    await expect(page.locator("#deviationNo")).not.toHaveValue("", { timeout: 30_000 });
    await page.getByRole("button", { name: /^create$/i }).click();

    await page.waitForURL(/\/reports\/[^/]+\/edit/, { timeout: 60_000 });
    createdReportId = page.url().match(/\/reports\/([^/]+)\/edit/)?.[1] ?? null;

    await expect(page.getByText(/Calculated the\s+TOC of blank water as per formula\./).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("[unsupported WMF image]")).toHaveCount(0);
    await expect(page.locator(".tiptap .tiptap-math-node")).toHaveCount(2, {
      timeout: 15_000,
    });
  });
});
