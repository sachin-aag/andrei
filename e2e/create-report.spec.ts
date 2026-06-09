import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsEngineer, loginAsManagerWithResponse } from "./helpers/auth";
import {
  createReport,
  deleteReport,
  uniqueDeviationNo,
} from "./helpers/reports";

const fixturePath = path.join(
  process.cwd(),
  "e2e/fixtures/minimal-report.docx"
);

test.describe.configure({ mode: "serial" });

test.describe("create report", () => {
  let createdReportId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (createdReportId) {
      await deleteReport(page, createdReportId);
      createdReportId = null;
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginAsEngineer(page);
  });

  test("opens create dialog from New Report button", async ({ page }) => {
    await page.getByRole("button", { name: /new report/i }).click();
    await expect(
      page.getByRole("heading", { name: /create investigation report/i })
    ).toBeVisible();
    await expect(page.locator("#deviationNo")).toBeVisible();
    await expect(page.locator("#report-upload")).toBeVisible();
    await expect(page.getByRole("button", { name: /^create$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^cancel$/i })).toBeVisible();
  });

  test("upload pre-fills deviation number", async ({ page }) => {
    await page.getByRole("button", { name: /new report/i }).click();
    await page.locator("#report-upload").setInputFiles(fixturePath);
    await expect(page.locator("#deviationNo")).not.toHaveValue("", {
      timeout: 30_000,
    });
  });

  test("clear file resets upload", async ({ page }) => {
    await page.getByRole("button", { name: /new report/i }).click();
    await page.locator("#report-upload").setInputFiles(fixturePath);
    await expect(page.getByRole("button", { name: /^clear$/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: /^clear$/i }).click();
    await expect(page.getByRole("button", { name: /^clear$/i })).toHaveCount(0);
  });

  test("shows toast when deviation number is empty", async ({ page }) => {
    await page.getByRole("button", { name: /new report/i }).click();
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page.getByText(/deviation number is required/i)).toBeVisible();
  });

  test("shows toast for duplicate deviation number", async ({ page }) => {
    const deviationNo = uniqueDeviationNo("DUP");
    const created = await createReport(page, { deviationNo });
    createdReportId = created.id;

    await page.goto("/");
    await page.getByRole("button", { name: /new report/i }).click();
    await page.locator("#deviationNo").fill(deviationNo);
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(
      page.getByText(/already have a report with this deviation number/i)
    ).toBeVisible();
  });

  test("creates blank report and navigates to editor", async ({ page }) => {
    const deviationNo = uniqueDeviationNo("NEW");
    await page.getByRole("button", { name: /new report/i }).click();
    await page.locator("#deviationNo").fill(deviationNo);
    await page.getByRole("button", { name: /^create$/i }).click();
    await expect(page).toHaveURL(/\/reports\/[^/]+\/edit/, { timeout: 30_000 });
    const match = page.url().match(/\/reports\/([^/]+)\/edit/);
    createdReportId = match?.[1] ?? null;
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible();
  });

  test("cancel closes dialog", async ({ page }) => {
    await page.getByRole("button", { name: /new report/i }).click();
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(
      page.getByRole("heading", { name: /create investigation report/i })
    ).toHaveCount(0);
    await expect(page.getByText(/my reports/i)).toBeVisible();
  });

  test("deletes report from dashboard", async ({ page }) => {
    const created = await createReport(page);
    createdReportId = created.id;
    await page.goto("/");
    await page
      .getByRole("button", { name: new RegExp(`delete report ${created.deviationNo}`, "i") })
      .click();
    await page.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByText(/report deleted/i)).toBeVisible();
    createdReportId = null;
  });
});

test("manager does not see New Report button", async ({ page }) => {
  await loginAsManagerWithResponse(page);
  await expect(page.getByRole("button", { name: /new report/i })).toHaveCount(0);
});
