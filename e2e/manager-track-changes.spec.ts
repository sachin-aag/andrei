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
  // Text content alone is not enough: an over-broad "other suggestion" rule
  // once hid the reviewer's own insert with display:none, so the edit saved
  // but never appeared. Assert it is actually on screen.
  await expect(
    editor.locator(".suggestion-insert").filter({ hasText: mark }).first()
  ).toBeVisible();
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

  test("renders leftover markdown hashes and bold in Corrective Action", async ({
    page,
  }) => {
    await authenticateAsManager(page);
    const blob = [
      "### Corrective Actions",
      "1. **Personnel Training:** Retrain operators on SOP-12.",
    ].join("\n");
    const seed = await page.request.patch(
      `/api/reports/${reportId}/sections/improve`,
      {
        data: {
          content: {
            narrative: { type: "doc", content: [{ type: "paragraph" }] },
            correctiveActions: {
              type: "doc",
              content: [
                { type: "paragraph", content: [{ type: "text", text: blob }] },
              ],
            },
          },
        },
        headers: await browserCookieHeaders(page),
      }
    );
    expect(seed.ok(), `seed improve failed (${seed.status()})`).toBeTruthy();

    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^improve$/i })).toBeVisible({
      timeout: 30_000,
    });

    const editor = improveEditor(page);
    await editor.scrollIntoViewIfNeeded();
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toContainText("Corrective Actions");
    await expect(editor).toContainText("Personnel Training:");
    await expect(editor).not.toContainText("###");
    await expect(
      editor.locator("strong").filter({ hasText: "Corrective Actions" })
    ).toHaveCount(1);
    await expect(
      editor.locator("strong").filter({ hasText: "Personnel Training:" })
    ).toHaveCount(1);
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

  test("types in Define while an AI suggestion is still unaccepted", async ({
    page,
  }) => {
    const anchor = "a deviation was observed during testing";
    const seedNarrative = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: `On 01/01/2026 at 10:00 hrs, ${anchor}. The result exceeded acceptance limits.`,
            },
          ],
        },
      ],
    };
    await authenticateAsManager(page);
    // Managers may save while the report is submitted / in review — that is the
    // same rule the editor relies on, so seed the body with this session.
    const seedSection = await page.request.patch(
      `/api/reports/${reportId}/sections/define`,
      {
        data: { content: { narrative: seedNarrative } },
        headers: await browserCookieHeaders(page),
      }
    );
    expect(
      seedSection.ok(),
      `seed define failed (${seedSection.status()})`
    ).toBeTruthy();

    const seedSuggestion = await page.request.post(
      "/api/test/seed-ai-suggestion",
      {
        data: {
          reportId,
          section: "define",
          contentPath: "narrative",
          anchorText: anchor,
          insertText: " on filling line FL-02",
          criterionKey: "define_equipment",
          criterionLabel: "Equipment is identified",
        },
        headers: await browserCookieHeaders(page),
      }
    );
    expect(
      seedSuggestion.ok(),
      `seed ai suggestion failed (${seedSuggestion.status()})`
    ).toBeTruthy();

    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });

    const editor = defineEditor(page);
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await expect(editor).toHaveAttribute("contenteditable", "true");
    // Inline AI preview is on screen and still unaccepted.
    await expect(
      editor.locator('[data-suggestion-author="ai"]').first()
    ).toBeVisible({ timeout: 30_000 });

    const mark = `mgr-with-suggestion-${Date.now()}`;
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.type(` ${mark}`, { delay: 25 });

    await expect(editor).toContainText(mark, { timeout: 15_000 });
    await expectTypedAsInsertNotDelete(editor, mark);
    // The typed run must be the manager's, never part of the AI suggestion.
    await expect(
      editor.locator(`[data-suggestion-author="ai"]`).filter({ hasText: mark })
    ).toHaveCount(0);
    // The AI proposal stays visible next to it, still unaccepted.
    await expect(
      editor.locator('[data-suggestion-author="ai"]').first()
    ).toBeVisible();
    await expect(defineSection(page).getByText(/saved/i)).toBeVisible({
      timeout: 30_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(defineEditor(page)).toContainText(mark, { timeout: 30_000 });
    await expectTypedAsInsertNotDelete(defineEditor(page), mark);
  });

  test("types in a plain Analyze field while an AI suggestion is unaccepted", async ({
    page,
  }) => {
    const anchor = "the alarm sounded before the line halted";
    await authenticateAsManager(page);
    const seedSection = await page.request.patch(
      `/api/reports/${reportId}/sections/analyze`,
      {
        data: {
          content: {
            brainstorming: `Operators reported ${anchor} at 10:05 hrs.`,
          },
        },
        headers: await browserCookieHeaders(page),
      }
    );
    expect(
      seedSection.ok(),
      `seed analyze failed (${seedSection.status()})`
    ).toBeTruthy();

    const seedSuggestion = await page.request.post(
      "/api/test/seed-ai-suggestion",
      {
        data: {
          reportId,
          section: "analyze",
          contentPath: "brainstorming",
          anchorText: anchor,
          insertText: " on filling line FL-02",
          criterionKey: "analyze_brainstorming",
          criterionLabel: "Brainstorming is captured",
        },
        headers: await browserCookieHeaders(page),
      }
    );
    expect(
      seedSuggestion.ok(),
      `seed ai suggestion failed (${seedSuggestion.status()})`
    ).toBeTruthy();

    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^analyze$/i })).toBeVisible({
      timeout: 30_000,
    });

    const field = analyzePlainField(page, "brainstorming");
    const shell = page.locator('[data-field-shell="analyze.brainstorming"]');
    await expect(async () => {
      await expect(shell).toBeVisible();
      await shell.scrollIntoViewIfNeeded();
      await expect(field).toBeAttached();
    }).toPass({ timeout: 30_000 });
    await expect(field).toBeEnabled({ timeout: 30_000 });
    // Inline AI preview is on screen and still unaccepted.
    await expect(shell.locator(".suggestion-insert").first()).toBeVisible({
      timeout: 30_000,
    });

    const mark = `mgr-plain-suggestion-${Date.now()}`;
    await field.focus();
    await field.pressSequentially(mark, { delay: 20 });
    await expect(field).toHaveValue(new RegExp(mark), { timeout: 15_000 });
  });

  test("marks Brainstorming and Other Tools typing as inserts", async ({ page }) => {
    await authenticateAsManager(page);
    await gotoWithNavigationRetry(page, `/reports/${reportId}/review`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /^analyze$/i })).toBeVisible({
      timeout: 30_000,
    });
    // Section editors load in parallel. Control is below Analyze; once it is
    // mounted, height changes above Brainstorming have settled.
    await expect(page.getByRole("heading", { name: /^control$/i })).toBeVisible({
      timeout: 30_000,
    });

    for (const contentPath of ["brainstorming", "otherTools"] as const) {
      const field = analyzePlainField(page, contentPath);
      const shell = page.locator(`[data-field-shell="analyze.${contentPath}"]`);
      await expect(async () => {
        await expect(shell).toBeVisible();
        await shell.scrollIntoViewIfNeeded();
        await expect(field).toBeAttached();
      }).toPass({ timeout: 30_000 });
      await expect(field).toBeEnabled({ timeout: 30_000 });
      await field.focus();
      // Toolbar is always mounted in review (aria-label "Editing"). Wait until
      // focus registered — the label names the field — before typing.
      const fieldLabel =
        contentPath === "brainstorming" ? "Brainstorming" : "Other Tools";
      await expect(page.getByRole("toolbar", { name: "Editing" })).toContainText(
        `Editing: ${fieldLabel}`
      );
      const mark = `mgr-${contentPath}-${Date.now()}`;
      await field.pressSequentially(mark, { delay: 20 });
      await expect(field).toHaveValue(mark);
      await expectTypedAsInsertNotDelete(shell, mark);
    }
  });
});
