import { expect, test } from "@playwright/test";
import { loginAsEngineer } from "./helpers/auth";
import { browserCookieHeaders } from "./helpers/api";
import { createReport, deleteReport } from "./helpers/reports";
import { expandWorkProductPanel, openReportEditor, setReportChrome } from "./helpers/workspace";

async function seedDocumentRevisions(
  page: import("@playwright/test").Page,
  reportId: string
) {
  const res = await page.request.post("/api/test/seed-document-revisions", {
    data: { reportId },
    headers: await browserCookieHeaders(page),
  });
  expect(
    res.ok(),
    `seed document revisions failed (${res.status()})`
  ).toBeTruthy();
}

test.describe("document revisions", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await loginAsEngineer(page);
    const created = await createReport(page);
    reportId = created.id;
    await seedDocumentRevisions(page, created.id);
    await openReportEditor(page, created.id);
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("compares two seeded versions inline and exits back to the live report", async ({
    page,
  }) => {
    await setReportChrome(page, "agent");
    await expandWorkProductPanel(page);
    await page.getByTestId("document-revision-history").click();
    await expect(page.getByText("Version 1")).toBeVisible();
    await expect(page.getByText("Version 2")).toBeVisible();
    await page.getByTestId("document-revision-compare").click();

    const diff = page.getByTestId("document-revision-diff");
    await expect(diff).toBeVisible();
    await expect(diff.getByText("Comparing version 1 → version 2")).toBeVisible();
    await expect(
      diff.locator(".suggestion-delete").filter({ hasText: /temperature/i })
    ).toBeVisible();
    await expect(
      diff.locator(".suggestion-insert").filter({ hasText: /humidity/i })
    ).toBeVisible();
    await expect(page.locator("#define")).toBeHidden();

    await page.getByTestId("document-revision-diff-exit").click();
    await expect(diff).toHaveCount(0);
    await expect(page.locator("#define")).toBeVisible();
  });
});
