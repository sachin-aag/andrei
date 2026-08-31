import { expect, type Page } from "@playwright/test";
import { gotoWithNavigationRetry } from "./navigation";

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

/** Assistant turn header — not the sidebar Assistant tab button. */
export function chatAssistantMessage(page: Page) {
  return reportSidebar(page).getByLabel("Assistant message");
}

/** Per-turn Report | Analytics tag in the transcript. */
export function chatMessageTargetTag(
  page: Page,
  target: "report" | "analytics"
) {
  return reportSidebar(page).getByTestId(`chat-message-target-${target}`);
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

/** Convergent DV reports expose a Contents tab in the left panel. */
export async function openDocumentsContentsTab(page: Page): Promise<void> {
  await expandDocumentsPanel(page);
  const tab = documentsPanel(page).getByRole("button", { name: /^contents$/i });
  if (await tab.isVisible()) {
    if ((await tab.getAttribute("aria-pressed")) !== "true") {
      await tab.click();
    }
    await expect(tab).toHaveAttribute("aria-pressed", "true");
  }
}

/** App shell nav starts collapsed — expand before using footer profile link. */
export async function expandPrimaryNav(page: Page): Promise<void> {
  const nav = primaryNav(page);
  const expand = nav.getByRole("button", { name: /expand sidebar/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
}

/** Report sidebar may start collapsed — expand before switching tabs. */
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
 *
 * Composer Report | Analytics is persisted per user + report. After reload the
 * textarea may be Analytics (`analytics-chat-input`) with worksheet placeholder
 * copy — do not require the Document-chat placeholder.
 */
export async function openReportAssistant(page: Page): Promise<void> {
  await openReportSidebarTab(page, "assistant");
  const sidebar = reportSidebar(page);
  await expect(sidebar.getByLabel("Assistant mode")).toBeVisible({
    timeout: 15_000,
  });
  await expect(sidebar.locator("textarea")).toBeEnabled({ timeout: 15_000 });
}

export async function openReportAnalytics(page: Page): Promise<void> {
  const tab = page.getByTestId("report-surface-analytics");
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await tab.click();
  await expect(page.getByTestId("report-analytics-workspace")).toBeVisible({
    timeout: 30_000,
  });
}

/** Composer Report | Analytics — independent of the focused canvas pane. */
export async function setChatWorkProductTarget(
  page: Page,
  target: "report" | "analytics"
): Promise<void> {
  const sidebar = reportSidebar(page);
  const control = sidebar.getByTestId("chat-work-product-target");
  await expect(control).toBeVisible({ timeout: 15_000 });
  const current = (await control.innerText()).trim().toLowerCase();
  if (current === target) {
    if (target === "analytics") {
      await expect(sidebar.getByTestId("analytics-chat-input")).toBeVisible();
    }
    return;
  }
  await control.click();
  const optionName = target === "analytics" ? /^analytics$/i : /^report$/i;
  await page.getByRole("option", { name: optionName }).click();
  if (target === "analytics") {
    await expect(sidebar.getByTestId("analytics-chat-input")).toBeVisible();
  } else {
    await expect(sidebar.getByTestId("analytics-chat-input")).toHaveCount(0);
  }
}

/** Report workspace shell + Define section are mounted in Document chrome. */
export async function waitForReportEditor(page: Page): Promise<void> {
  const chromeSwitch = page.getByTestId("report-chrome-switch");
  await expect(chromeSwitch).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => chromeSwitch.getAttribute("data-current-chrome"))
    .toMatch(/^(document|agent)$/);

  if ((await chromeSwitch.getAttribute("data-current-chrome")) !== "document") {
    await setReportChrome(page, "document");
  }

  const defineHeading = page.getByRole("heading", { name: /^define$/i });
  await expect(defineHeading).toBeVisible({ timeout: 30_000 });
  await defineSection(page).scrollIntoViewIfNeeded();
  await expect(defineEditor(page)).toBeVisible({ timeout: 30_000 });
}

export async function openReportEditor(
  page: Page,
  reportId: string,
  opts?: { mode?: "edit" | "review" }
): Promise<void> {
  const mode = opts?.mode ?? "edit";
  await gotoWithNavigationRetry(page, `/reports/${reportId}/${mode}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForReportEditor(page);
}

/** Matches `PREVIEW_ABS_MIN_PX` in workspace-layout — expanded preview is never this narrow. */
const EXPANDED_WORK_PRODUCT_MIN_PX = 320;

export async function expandWorkProductPanel(page: Page): Promise<void> {
  const panel = page.getByTestId("report-work-product");
  const expand = panel.getByRole("button", { name: /expand document panel/i });
  if (await expand.isVisible()) {
    await expand.click();
  }
  await expect(
    panel.getByRole("button", { name: /collapse document panel/i })
  ).toBeVisible();
  await expect(page.getByTestId("work-product-tab-strip")).toBeVisible();
  // Width animates 200ms from COLLAPSED_RAIL_PX (48). Waiting only for >52
  // succeeds on the first transition frame, so later geometry checks flake on
  // WebKit (collapse control vs Report tab).
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(EXPANDED_WORK_PRODUCT_MIN_PX);
}

/** Resize handle is absolutely positioned on the work-product column's left edge. */
export async function expectDocumentPanelResizeHandleAligned(
  page: Page
): Promise<void> {
  const panel = page.getByTestId("report-work-product");
  const handle = page.getByRole("separator", {
    name: /resize document panel/i,
  });
  await expect(handle).toBeVisible();
  await expect.poll(async () => {
    const [panelBox, handleBox] = await Promise.all([
      panel.boundingBox(),
      handle.boundingBox(),
    ]);
    if (!panelBox || !handleBox) return Number.POSITIVE_INFINITY;
    return Math.abs(handleBox.x + handleBox.width / 2 - panelBox.x);
  }).toBeLessThan(16);
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
  await expect(switchBtn).toBeVisible({ timeout: 30_000 });
  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await switchBtn.getAttribute("data-current-chrome")) === chrome) {
      break;
    }
    await switchBtn.click({ force: attempt > 0 });
    try {
      await expect(switchBtn).toHaveAttribute("data-current-chrome", chrome, {
        timeout: 5_000,
      });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  if (chrome === "document") {
    await expect(page.getByTestId("report-work-product")).toBeVisible({
      timeout: 30_000,
    });
  }
}

/** Collapse the assistant sidebar. */
export async function collapseReportSidebar(page: Page): Promise<void> {
  const sidebar = reportSidebar(page);
  const collapse = sidebar.getByRole("button", { name: /collapse sidebar/i });
  if (await collapse.isVisible()) {
    await expect(collapse).toBeEnabled({ timeout: 15_000 });
    await collapse.click();
    await expect(sidebar.getByRole("button", { name: /expand sidebar/i })).toBeVisible();
  }
}

/** Turn on the Comments switch so the review margin can mount. */
export async function enableCommentsGutter(page: Page): Promise<void> {
  const toggle = page.getByRole("switch", { name: /comments/i });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
}

/** Turn on the Comments switch so the review margin mounts. */
export async function showReviewMargin(page: Page): Promise<void> {
  await enableCommentsGutter(page);
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
  await showReviewMargin(page);
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
  await showReviewMargin(page);
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
