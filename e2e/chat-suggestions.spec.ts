import { expect, test, type Page } from "@playwright/test";
import { authenticateAsEngineer, loginAsEngineer } from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import {
  collapseReportSidebar,
  openReportSidebarTab,
  reportSidebar,
  reviewMargin,
} from "./helpers/workspace";

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
  await openReportSidebarTab(page, "assistant");
  const sidebar = reportSidebar(page);
  const agent = sidebar.getByRole("button", { name: /^agent$/i });
  await expect(agent).toBeEnabled({ timeout: 15_000 });
  await agent.click();
  await expect(chatInput(page)).toBeVisible({ timeout: 15_000 });
}

function chatInput(page: Page) {
  return reportSidebar(page).getByRole("combobox", {
    name: /message the assistant/i,
  });
}

async function sendChat(page: Page, text: string): Promise<void> {
  await chatInput(page).fill(text);
  await reportSidebar(page).getByRole("button", { name: /send message/i }).click();
}

function suggestionCardHeading(page: Page) {
  return reviewMargin(page).getByText(
    /^(Draft step \d+ of \d+|Suggestion \d+ of \d+|Full draft \d+ of \d+)$/
  );
}

function applySuggestion(page: Page) {
  return reviewMargin(page).getByRole("button", { name: /^apply$/i });
}

async function waitForDraftQueue(page: Page): Promise<void> {
  await expect(page.getByText(/changes to review in the document/i)).toBeVisible({
    timeout: 45_000,
  });
  // The expanded Assistant sidebar covers the review gutter; collapse it so the
  // draft-step cards are actually visible to Playwright (and to the user).
  await collapseReportSidebar(page);
  await expect(suggestionCardHeading(page).first()).toBeVisible({ timeout: 15_000 });
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
    await waitForDraftQueue(page);

    // The card numbers the block within the draft, and keeps that number as the
    // queue drains (the queue position alone would always read "1 of N").
    await expect(suggestionCardHeading(page).first()).toHaveText(/Draft step 1 of [2-9]/);
  });

  test("accepting a block advances the queue and applies exactly what was previewed", async ({
    page,
  }) => {
    await openAssistant(page);
    await sendChat(page, "Draft the define section [[stub:draft]]");
    await waitForDraftQueue(page);

    const firstStep = await suggestionCardHeading(page).first().textContent();
    const total = Number(/of (\d+)/.exec(firstStep ?? "")?.[1] ?? "0");
    expect(total).toBeGreaterThan(1);

    // The gutter card shows the proposed text. (The editor also injects it as a
    // suggestion mark, but inactive copies are `display: none`, so a page-wide
    // getByText().first() resolves to a hidden span.)
    const previewed = "Block one describes what was detected during routine inspection.";
    await expect(reviewMargin(page).getByText(previewed)).toBeVisible({ timeout: 20_000 });

    await applySuggestion(page).click();

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
    await waitForDraftQueue(page);

    // Walk the queue to the list block, applying each card. Apply animations
    // take a few seconds, so wait for the heading to change rather than a
    // fixed timeout (which used to click a still-disabled Apply).
    for (let i = 0; i < 3; i++) {
      const apply = applySuggestion(page);
      if (!(await apply.isVisible().catch(() => false))) break;
      const before = (await suggestionCardHeading(page).first().textContent()) ?? "";
      await expect(apply).toBeEnabled();
      await apply.click();
      if (i < 2) {
        await expect(suggestionCardHeading(page).first()).not.toHaveText(before, {
          timeout: 20_000,
        });
      }
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
