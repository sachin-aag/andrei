import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { browserCookieHeaders } from "./helpers/api";
import { gotoWithNavigationRetry } from "./helpers/navigation";
import { createReport, deleteReport } from "./helpers/reports";
import {
  collapseReportSidebar,
  defineEditor,
  reviewMargin,
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
  await gotoWithNavigationRetry(page, `/reports/${reportId}/edit`, {
    waitUntil: "domcontentloaded",
  });
  const editor = defineEditor(page);
  await expect(editor).toBeVisible({ timeout: 30_000 });
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
    await collapseReportSidebar(page);

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
});
