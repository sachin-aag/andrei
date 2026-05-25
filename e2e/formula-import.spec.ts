import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsEngineer, unlockIfNeeded } from "./helpers/auth";

const fixturePath = path.join(
  process.cwd(),
  "docs",
  "Draft Investigation (DEV-QC-26-001).docx"
);

test.describe("legacy equation formula rendering", () => {
  test.skip(!fs.existsSync(fixturePath), "Draft Investigation fixture missing");

  test("imports DOCX formulas as visible inline images in the editor", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/");
    await unlockIfNeeded(page);
    await loginAsEngineer(page);

    await page.getByRole("button", { name: /new report/i }).click();
    await page.locator("#report-upload").setInputFiles(fixturePath);
    await expect(page.locator("#deviationNo")).not.toHaveValue("", { timeout: 30_000 });
    await page.getByRole("button", { name: /^create$/i }).click();

    await page.waitForURL(/\/reports\/[^/]+\/edit/, { timeout: 60_000 });
    await page.getByRole("button", { name: /measure/i }).click();

    await expect(page.getByText(/Calculated the\s+TOC of blank water as per formula\./)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("[unsupported WMF image]")).toHaveCount(0);
    await expect(page.locator('.tiptap img[data-image-inline="true"]')).toHaveCount(2, {
      timeout: 15_000,
    });
  });
});
