import { expect, test, type Page } from "@playwright/test";
import { authenticateAsEngineer, loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";

/**
 * The chat → draft → suggestion-queue → accept loop, driven by the scripted stub
 * model (ALLOW_TEST_STUB_CHAT), so it runs with no Gemini credential.
 *
 * `[[stub:draft]]` in the message makes the stub call `draft_field` with a
 * multi-block markdown draft instead of a single `propose_edit` — the path that
 * used to collapse a whole section into one take-it-or-leave-it card.
 */

test.describe.configure({ mode: "serial" });

async function openAssistant(page: Page): Promise<void> {
  await page.getByRole("button", { name: /assistant/i }).first().click();
  await expect(chatInput(page)).toBeVisible({ timeout: 30_000 });
}

function chatInput(page: Page) {
  return page.getByPlaceholder(/ask the assistant to draft or improve/i);
}

async function sendChat(page: Page, text: string): Promise<void> {
  await chatInput(page).fill(text);
  await page.getByRole("button", { name: /send message/i }).click();
}

function suggestionCardHeading(page: Page) {
  return page.getByText(/^(Draft step \d+ of \d+|Suggestion \d+ of \d+|Full draft \d+ of \d+)$/);
}

test.describe("chat drafting → suggestion queue", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
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
      await authenticateAsEngineer(page);
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("a drafted section arrives as several block cards, not one giant one", async ({
    page,
  }) => {
    await openAssistant(page);
    await sendChat(page, "Draft the define section [[stub:draft]]");

    // The chat chip reports how many separate changes landed.
    await expect(page.getByText(/changes to review in the document/i)).toBeVisible({
      timeout: 45_000,
    });

    // The card numbers the block within the draft, and keeps that number as the
    // queue drains (the queue position alone would always read "1 of N").
    const heading = suggestionCardHeading(page).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
    await expect(heading).toHaveText(/Draft step 1 of [2-9]/);
  });

  test("accepting a block advances the queue and applies exactly what was previewed", async ({
    page,
  }) => {
    await openAssistant(page);
    await sendChat(page, "Draft the define section [[stub:draft]]");
    await expect(suggestionCardHeading(page).first()).toBeVisible({ timeout: 45_000 });

    const firstStep = await suggestionCardHeading(page).first().textContent();
    const total = Number(/of (\d+)/.exec(firstStep ?? "")?.[1] ?? "0");
    expect(total).toBeGreaterThan(1);

    // The preview text is what accepting must produce.
    const previewed = "Block one describes what was detected during routine inspection.";
    await expect(page.getByText(previewed).first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /^accept$/i }).first().click();

    // Applied into the document…
    await expect(page.locator(".ProseMirror").first()).toContainText(previewed, {
      timeout: 30_000,
    });
    // …and the queue moved on to the next block rather than repeating step 1.
    await expect(suggestionCardHeading(page).first()).toHaveText(
      new RegExp(`Draft step 2 of ${total}`),
      { timeout: 30_000 }
    );
  });

  test("a bullet block previews and applies as a real list", async ({ page }) => {
    await openAssistant(page);
    await sendChat(page, "Draft the define section [[stub:draft]]");
    await expect(suggestionCardHeading(page).first()).toBeVisible({ timeout: 45_000 });

    // Walk the queue to the list block, accepting each card.
    for (let i = 0; i < 3; i++) {
      const accept = page.getByRole("button", { name: /^accept$/i }).first();
      if (!(await accept.isVisible().catch(() => false))) break;
      await accept.click();
      await page.waitForTimeout(1500);
    }

    const editor = page.locator(".ProseMirror").first();
    await expect(editor).toContainText("Quarantine the affected batch", {
      timeout: 30_000,
    });
    // A real <li>, not "- Quarantine…" flattened into a paragraph.
    await expect(
      editor.locator("li", { hasText: "Quarantine the affected batch" })
    ).toHaveCount(1);
  });
});
