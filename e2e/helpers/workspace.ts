import { expect, type Page } from "@playwright/test";

export function primaryNav(page: Page) {
  return page.getByRole("complementary", { name: "Primary navigation" });
}

export function reportSidebar(page: Page) {
  return page.getByRole("complementary", { name: "Report sidebar" });
}

export function reviewMargin(page: Page) {
  return page.getByRole("complementary", { name: "Review margin" });
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
  tab: "placeholders" | "criteria" | "comments"
): Promise<void> {
  await expandReportSidebar(page);
  const label = tab.charAt(0).toUpperCase() + tab.slice(1);
  await reportSidebar(page)
    .getByRole("button", { name: new RegExp(`^${label}$`, "i") })
    .click();
}

/** Expanded report sidebar overlays the review margin and blocks gutter clicks. */
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
  // Keyboard activation avoids the expanded report sidebar overlay intercepting clicks.
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(margin.getByPlaceholder(/^reply/i)).toBeVisible({ timeout: 15_000 });
}
