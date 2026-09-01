import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import {
  defineEditor,
  openReportEditor,
  setReportChrome,
} from "./helpers/workspace";

test.describe("inline proofread", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
    await openReportEditor(page, reportId);
    await setReportChrome(page, "document");
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("underlines dont and applies don't from the popover", async ({
    page,
  }) => {
    const editor = defineEditor(page);
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await editor.pressSequentially("i dont know what happened here");

    const issue = page.getByTestId("proofread-issue");
    await expect(issue).toBeVisible({ timeout: 15_000 });
    await expect(issue).toHaveAttribute("data-proofread-severity", "grammar");
    await issue.click();

    const popover = page.getByTestId("proofread-popover");
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("button", { name: /apply don't/i })).toBeVisible();
    await popover.getByRole("button", { name: /apply don't/i }).click();

    await expect(editor).toContainText("don't");
    await expect(page.getByTestId("proofread-issue")).toHaveCount(0);
    await expect(page.getByTestId("proofread-popover")).toHaveCount(0);
  });

  test("dismisses a grammar underline without changing the text", async ({
    page,
  }) => {
    const editor = defineEditor(page);
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.click();
    await editor.pressSequentially("i dont know what happened here");

    const issue = page.getByTestId("proofread-issue");
    await expect(issue).toBeVisible({ timeout: 15_000 });
    await issue.click();
    await page.getByTestId("proofread-popover").getByLabel(/dismiss suggestion/i).click();

    await expect(page.getByTestId("proofread-issue")).toHaveCount(0);
    await expect(editor).toContainText("dont");
    await expect(editor).not.toContainText("don't");
  });
});
