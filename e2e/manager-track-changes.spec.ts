import { expect, test, type Page } from "@playwright/test";
import {
  authenticateAsEngineer,
  authenticateAsManager,
  loginAsEngineer,
} from "./helpers/auth";
import { browserCookieHeaders } from "./helpers/api";
import { gotoWithNavigationRetry } from "./helpers/navigation";
import { createReport, deleteReport } from "./helpers/reports";
import { defineEditor, defineSection, analyzePlainField } from "./helpers/workspace";
import { signedWorkflowPayload } from "./helpers/signing";

function improveEditor(page: Page) {
  return page.locator("#improve .ProseMirror").first();
}

function improveSection(page: Page) {
  return page.locator("#improve");
}

async function expectTypedAsInsertNotDelete(
  editor: ReturnType<Page["locator"]>,
  mark: string
) {
  await expect
    .poll(async () => {
      const inserts = await editor.locator(".suggestion-insert").allTextContents();
      return inserts.join("");
    })
    .toContain(mark);
  const deletes = await editor.locator(".suggestion-delete").allTextContents();
  expect(deletes.join("")).not.toContain(mark);
}

test.describe("manager track changes persist", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;

    const submitRes = await page.request.post(`/api/reports/${reportId}/submit`, {
      data: signedWorkflowPayload(),
      headers: await browserCookieHeaders(page),
    });
    expect(submitRes.ok(), `submit failed (${submitRes.status()})`).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await authenticateAsEngineer(page);
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("saves Define track-changes edits across reload", async ({ page }) => {
    await authenticateAsManager(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });

    const mark = `mgr-define-${Date.now()}`;
    const editor = defineEditor(page);
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await editor.click();
    await page.keyboard.type(` ${mark}`, { delay: 25 });
    await expectTypedAsInsertNotDelete(editor, mark);
    await expect(defineSection(page).getByText(/saved/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(defineEditor(page)).toContainText(mark, { timeout: 30_000 });
  });

  test("saves Improve track-changes edits across reload", async ({ page }) => {
    await authenticateAsManager(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^improve$/i })).toBeVisible({
      timeout: 30_000,
    });

    const mark = `mgr-improve-${Date.now()}`;
    const editor = improveEditor(page);
    await editor.scrollIntoViewIfNeeded();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await editor.click();
    await page.keyboard.type(` ${mark}`, { delay: 25 });
    await expectTypedAsInsertNotDelete(editor, mark);
    await expect(improveSection(page).getByText(/saved/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^improve$/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(improveEditor(page)).toContainText(mark, { timeout: 30_000 });
  });

  test("keeps a new line and types into it instead of joining", async ({ page }) => {
    await authenticateAsManager(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });

    const mark = `mgr-enter-${Date.now()}`;
    const editor = defineEditor(page);
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await editor.click();
    await page.keyboard.type("mgr-before-enter ", { delay: 25 });
    await expectTypedAsInsertNotDelete(editor, "mgr-before-enter");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type(mark, { delay: 25 });

    await expect.poll(async () => editor.locator("p").count()).toBeGreaterThan(1);
    await expectTypedAsInsertNotDelete(editor, mark);
    await expect(editor.locator("p").last()).toContainText(mark);
  });

  test("marks Brainstorming and Other Tools typing as inserts", async ({ page }) => {
    await authenticateAsManager(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^analyze$/i })).toBeVisible({
      timeout: 30_000,
    });

    for (const contentPath of ["brainstorming", "otherTools"] as const) {
      const field = analyzePlainField(page, contentPath);
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeEnabled({ timeout: 30_000 });
      await field.click();
      const mark = `mgr-${contentPath}-${Date.now()}`;
      await page.keyboard.type(mark, { delay: 25 });
      await expectTypedAsInsertNotDelete(field.locator("xpath=.."), mark);
    }
  });
});
