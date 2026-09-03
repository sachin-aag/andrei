import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { browserCookieHeaders } from "./helpers/api";
import { createReport, deleteReport } from "./helpers/reports";
import {
  defineEditor,
  openReportEditor,
  reviewMargin,
  setReportChrome,
  showReviewMargin,
} from "./helpers/workspace";

const ANCHOR = "a deviation was observed during testing";
const INSERT = " on filling line FL-02";

const seedNarrative = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `On 01/01/2026 at 10:00 hrs, ${ANCHOR}. The result exceeded acceptance limits.`,
        },
      ],
    },
  ],
};

async function seedDefineSuggestion(
  page: import("@playwright/test").Page,
  reportId: string
) {
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
        anchorText: ANCHOR,
        insertText: INSERT,
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
}

async function openDefineWithPreview(
  page: import("@playwright/test").Page,
  reportId: string
) {
  await openReportEditor(page, reportId);
  const editor = defineEditor(page);
  await expect(
    editor.locator(".suggestion-insert").filter({ hasText: INSERT.trim() })
  ).toBeVisible({ timeout: 30_000 });
  return editor;
}

type SampleHandle = { id: number; seen: string[] };

async function startSamplingDefine(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const el = document.querySelector("#define .ProseMirror");
    const seen: string[] = [];
    const id = window.setInterval(() => {
      seen.push((el as HTMLElement | null)?.innerText ?? "");
    }, 16);
    (
      window as unknown as { __acceptSamples: SampleHandle }
    ).__acceptSamples = { id, seen };
  });
}

async function stopSamplingDefine(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const handle = (
      window as unknown as { __acceptSamples?: SampleHandle }
    ).__acceptSamples;
    if (!handle) return [] as string[];
    window.clearInterval(handle.id);
    return handle.seen;
  });
}

function expectInsertNeverDropped(samples: string[]) {
  expect(samples.length).toBeGreaterThan(0);
  const missing = samples.filter((text) => !text.includes("filling line FL-02"));
  expect(
    missing,
    `proposed insert vanished mid-apply (${missing.length} blank/reverted frames): ${JSON.stringify(missing.slice(0, 5))}`
  ).toEqual([]);
  for (const text of samples) {
    expect(text.trim().length).toBeGreaterThan(10);
  }
}

test.describe("suggestion accept keeps text visible", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
    await seedDefineSuggestion(page, reportId);
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("does not blank Define while the gutter Apply is in flight", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);
    await showReviewMargin(page);

    const apply = reviewMargin(page).getByRole("button", { name: /^apply$/i });
    await expect(apply).toBeVisible({ timeout: 15_000 });

    await startSamplingDefine(page);
    await apply.click();

    await expect(editor).toContainText("filling line FL-02", { timeout: 15_000 });
    await expect(editor.locator(".suggestion-insert")).toHaveCount(0);

    expectInsertNeverDropped(await stopSamplingDefine(page));
  });

  test("does not blank Define while inline Accept is in flight", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);

    const accept = editor.getByRole("button", { name: "Accept suggestion" });
    await expect(accept).toBeVisible({ timeout: 15_000 });

    await startSamplingDefine(page);
    await accept.click();

    await expect(editor).toContainText("filling line FL-02", { timeout: 15_000 });
    await expect(editor.locator(".suggestion-insert")).toHaveCount(0);

    expectInsertNeverDropped(await stopSamplingDefine(page));
  });

  test("shows Apply all and Dismiss all for a single pending suggestion", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);
    const applyAll = bulkApplyAll(page);
    await expect(applyAll).toBeVisible({ timeout: 15_000 });
    await expect(applyAll).toHaveText(/apply all 1/i);
    await expect(bulkDismissAll(page)).toBeVisible();
    await expect(editor.locator(".suggestion-insert")).toBeVisible();
  });

  test("Agent chrome proposes red/green marks and Apply all for one suggestion", async ({
    page,
  }) => {
    await openReportEditor(page, reportId!);
    await setReportChrome(page, "agent");
    const editor = defineEditor(page);
    await expect(
      editor.locator(".suggestion-insert").filter({ hasText: INSERT.trim() })
    ).toBeVisible({ timeout: 30_000 });
    await expect(editor.locator(".suggestion-delete")).toBeVisible();
    await expect(
      editor.getByRole("button", { name: "Accept suggestion" })
    ).toBeVisible();

    const applyAll = bulkApplyAll(page);
    await expect(applyAll).toBeVisible({ timeout: 15_000 });
    await expect(applyAll).toHaveText(/apply all 1/i);
    await expect(bulkDismissAll(page)).toBeVisible();
    await applyAll.click();

    await expect(editor).toContainText("filling line FL-02", { timeout: 15_000 });
    await expect(editor.locator(".suggestion-insert")).toHaveCount(0);
    await expect(bulkApplyAll(page)).toHaveCount(0, { timeout: 15_000 });
  });
});

test.describe("suggestion dismiss clears preview", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
    await seedDefineSuggestion(page, reportId);
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("inline Ignore removes red/green markup without a reload", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);
    const ignore = editor.getByRole("button", { name: "Ignore suggestion" });
    await expect(ignore).toBeVisible({ timeout: 15_000 });
    await ignore.click();

    await expect(editor.locator(".suggestion-insert")).toHaveCount(0);
    await expect(editor.locator(".suggestion-delete")).toHaveCount(0);
    await expect(editor.getByRole("button", { name: "Accept suggestion" })).toHaveCount(
      0
    );
    await expect(editor).not.toContainText("filling line FL-02");
    await expect(editor).toContainText(ANCHOR);
  });

  test("gutter Dismiss removes red/green markup while the field is focused", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);
    await editor.click();
    await showReviewMargin(page);
    const dismiss = reviewMargin(page).getByRole("button", { name: /^dismiss$/i });
    await expect(dismiss).toBeVisible({ timeout: 15_000 });
    await dismiss.click();

    await expect(editor.locator(".suggestion-insert")).toHaveCount(0);
    await expect(editor.locator(".suggestion-delete")).toHaveCount(0);
    await expect(editor).not.toContainText("filling line FL-02");
    await expect(editor).toContainText(ANCHOR);
  });
});

const SECOND_ANCHOR = "The result exceeded acceptance limits";
const SECOND_INSERT = " by 12%";

const MEASURE_ANCHOR = "Samples were pulled at the start of the run";
const MEASURE_INSERT = " using a calibrated balance";

const measureNarrative = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: `${MEASURE_ANCHOR}.` }],
    },
  ],
};

function bulkApplyAll(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: /^apply all \d+$/i });
}

function bulkDismissAll(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: /^dismiss all$/i });
}

test.describe("document-wide apply all and dismiss all", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
    await seedDefineSuggestion(page, reportId);

    const second = await page.request.post("/api/test/seed-ai-suggestion", {
      data: {
        reportId,
        section: "define",
        contentPath: "narrative",
        anchorText: SECOND_ANCHOR,
        insertText: SECOND_INSERT,
        criterionKey: "define_impact",
        criterionLabel: "Impact is described",
      },
      headers: await browserCookieHeaders(page),
    });
    expect(second.ok(), `second seed failed (${second.status()})`).toBeTruthy();

    // A third suggestion in a different section — the point of the bulk action.
    const seedMeasure = await page.request.patch(
      `/api/reports/${reportId}/sections/measure`,
      {
        data: { content: { narrative: measureNarrative } },
        headers: await browserCookieHeaders(page),
      }
    );
    expect(
      seedMeasure.ok(),
      `seed measure failed (${seedMeasure.status()})`
    ).toBeTruthy();

    const third = await page.request.post("/api/test/seed-ai-suggestion", {
      data: {
        reportId,
        section: "measure",
        contentPath: "narrative",
        anchorText: MEASURE_ANCHOR,
        insertText: MEASURE_INSERT,
        criterionKey: "measure.facts_data",
        criterionLabel: "Facts and data are stated",
      },
      headers: await browserCookieHeaders(page),
    });
    expect(third.ok(), `measure seed failed (${third.status()})`).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("Apply all applies suggestions in every section, not just the open one", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);

    const applyAll = bulkApplyAll(page);
    await expect(applyAll).toBeVisible({ timeout: 15_000 });
    await expect(applyAll).toHaveText(/apply all 3/i);
    await applyAll.click();

    await expect(editor).toContainText("filling line FL-02", { timeout: 15_000 });
    await expect(editor).toContainText("by 12%", { timeout: 15_000 });
    await expect(editor.locator(".suggestion-insert")).toHaveCount(0);

    // The measure suggestion was applied without ever opening that section.
    await expect(bulkApplyAll(page)).toHaveCount(0, { timeout: 15_000 });
    const measure = page.locator("#measure .ProseMirror");
    await expect(measure).toContainText("using a calibrated balance", {
      timeout: 15_000,
    });
  });

  test("Dismiss all clears the whole document without changing the text", async ({
    page,
  }) => {
    const editor = await openDefineWithPreview(page, reportId!);

    const dismissAll = bulkDismissAll(page);
    await expect(dismissAll).toBeVisible({ timeout: 15_000 });
    await dismissAll.click();

    await expect(editor).not.toContainText("filling line FL-02");
    await expect(editor).not.toContainText("by 12%");
    await expect(bulkDismissAll(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("#measure .ProseMirror")).not.toContainText(
      "using a calibrated balance"
    );
  });
});
