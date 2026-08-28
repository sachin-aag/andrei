import { expect, type Page } from "@playwright/test";

export function primaryNav(page: Page) {
  return page.getByRole("complementary", { name: "Primary navigation" });
}

export function reportSidebar(page: Page) {
  return page.getByRole("complementary", { name: "Report sidebar" });
}

/** User bubble — not the open-chat tab, which repeats the same title. */
export function chatUserMessage(
  page: Page,
  text: string | RegExp
) {
  return reportSidebar(page)
    .getByLabel("Your message")
    .filter({ hasText: text });
}

export function reviewMargin(page: Page) {
  return page.getByRole("complementary", { name: "Review margin" });
}

export function documentsPanel(page: Page) {
  return page.getByRole("complementary", { name: "Documents" });
}

/** Documents panel can be collapsed to an icon rail — expand before using it. */
export async function expandDocumentsPanel(page: Page): Promise<void> {
  const panel = documentsPanel(page);
  const expand = panel.getByRole("button", { name: /expand documents panel/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
  await expect(
    panel.getByRole("button", { name: /collapse documents panel/i })
  ).toBeVisible();
}

/** App shell nav starts collapsed — expand before using footer profile link. */
export async function expandPrimaryNav(page: Page): Promise<void> {
  const nav = primaryNav(page);
  const expand = nav.getByRole("button", { name: /expand sidebar/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
}

/** Report sidebar may start collapsed — tab labels are icon-only until expanded. */
export async function expandReportSidebar(page: Page): Promise<void> {
  const sidebar = reportSidebar(page);
  const expand = sidebar.getByRole("button", { name: /expand sidebar/i });
  if (await expand.isVisible()) {
    await expand.click();
    await expect(sidebar.getByRole("button", { name: /collapse sidebar/i })).toBeVisible();
  }
}

export async function openReportSidebarTab(
  page: Page,
  tab: "assistant" | "placeholders" | "criteria" | "comments"
): Promise<void> {
  await expandReportSidebar(page);
  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
  const button = reportSidebar(page).getByRole("button", {
    name: new RegExp(`^${label}$`, "i"),
  });
  await expect(button).toBeVisible({ timeout: 15_000 });
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    await button.click();
  }
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/**
 * Expand the report sidebar and wait until Assistant has finished loading
 * sessions. The tab is already selected on a fresh editor load — clicking it
 * during hydration remounts the button (CI flake on reload).
 */
export async function openReportAssistant(page: Page): Promise<void> {
  await openReportSidebarTab(page, "assistant");
  const sidebar = reportSidebar(page);
  await expect(sidebar.getByLabel("Assistant mode")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    sidebar.getByPlaceholder(/ask about the report or attachments|ask the assistant/i)
  ).toBeEnabled({ timeout: 15_000 });
}

export async function openReportAnalytics(page: Page): Promise<void> {
  await page.getByTestId("report-surface-analytics").click();
  await expect(page.getByTestId("report-analytics-workspace")).toBeVisible({
    timeout: 30_000,
  });
}

export async function expandWorkProductPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("report-work-product");
  const expand = panel.getByRole("button", { name: /expand document panel/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
  await expect(
    panel.getByRole("button", { name: /collapse document panel/i })
  ).toBeVisible();
}

export async function collapseWorkProductPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("report-work-product");
  const collapse = panel.getByRole("button", {
    name: /collapse document panel/i,
  });
  if (await collapse.isVisible()) {
    await collapse.click();
  }
  await expect(
    panel.getByRole("button", { name: /expand document panel/i })
  ).toBeVisible();
}

export async function setReportChrome(
  page: Page,
  chrome: "document" | "agent"
): Promise<void> {
  const switchBtn = page.getByTestId("report-chrome-switch");
  if ((await switchBtn.getAttribute("data-current-chrome")) !== chrome) {
    await switchBtn.click();
  }
  await expect(switchBtn).toHaveAttribute("data-current-chrome", chrome);
}

/** Collapse the assistant so the review margin (suggestions/comments) can show. */
export async function collapseReportSidebar(page: Page): Promise<void> {
  const sidebar = reportSidebar(page);
  const collapse = sidebar.getByRole("button", { name: /collapse sidebar/i });
  if (await collapse.isVisible()) {
    await collapse.click();
    await expect(sidebar.getByRole("button", { name: /expand sidebar/i })).toBeVisible();
  }
}

export function defineSection(page: Page) {
  return page.locator("#define");
}

export function defineEditor(page: Page) {
  return defineSection(page).locator(".ProseMirror").first();
}

export function analyzeSection(page: Page) {
  return page.locator("#analyze");
}

export function analyzePlainField(page: Page, contentPath: string) {
  return analyzeSection(page).locator(
    `[data-field-anchor="analyze.${contentPath}"]`
  );
}

/** Opens the review-margin “Add note on …” composer for a section. */
export async function openReviewMarginNote(
  page: Page,
  sectionLabel: string
): Promise<void> {
  await collapseReportSidebar(page);
  await reviewMargin(page)
    .getByRole("button", { name: new RegExp(`add note on ${sectionLabel}`, "i") })
    .click();
  await expect(
    reviewMargin(page).getByPlaceholder(/write a comment for the author/i)
  ).toBeVisible({ timeout: 15_000 });
}

/** Fills and posts a review-margin section note (manager review mode). */
export async function postReviewMarginNote(
  page: Page,
  sectionLabel: string,
  text: string
): Promise<void> {
  await openReviewMarginNote(page, sectionLabel);
  const margin = reviewMargin(page);
  await margin.getByPlaceholder(/write a comment for the author/i).fill(text);
  await margin.getByRole("button", { name: /^post$/i }).click();
  await expect(margin.getByText(text)).toBeVisible({ timeout: 15_000 });
}

/** Activates a margin comment card and posts a thread reply (edit or review mode). */
export async function replyToMarginComment(
  page: Page,
  commentText: string,
  replyText: string,
  opts?: { typeViaKeyboard?: boolean }
): Promise<void> {
  await openMarginCommentReply(page, commentText);
  const margin = reviewMargin(page);
  const replyField = margin.getByPlaceholder(/^reply/i);
  if (opts?.typeViaKeyboard) {
    await replyField.click();
    await page.keyboard.type(replyText);
    await expect(replyField).toHaveValue(replyText);
  } else {
    await replyField.fill(replyText);
  }
  await margin.getByRole("button", { name: /^reply$/i }).click();
  await expect(margin.getByText(replyText)).toBeVisible({ timeout: 15_000 });
}

/** Opens an expanded margin comment card with the reply field focused. */
export async function openMarginCommentReply(
  page: Page,
  commentText: string
): Promise<void> {
  await collapseReportSidebar(page);
  const margin = reviewMargin(page);
  await expect(margin.getByText(commentText)).toBeVisible({ timeout: 15_000 });
  const card = margin
    .locator('[role="button"]')
    .filter({ hasText: commentText })
    .first();
  await card.scrollIntoViewIfNeeded();
  // Keyboard activation is more reliable than clicking packed gutter cards.
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(margin.getByPlaceholder(/^reply/i)).toBeVisible({ timeout: 15_000 });
}
