import { expect, test } from "@playwright/test";
import {
  authenticateAsEngineer,
  authenticateAsManager,
  fetchTestManagerUser,
  loginAsEngineer,
} from "./helpers/auth";
import { createReport, deleteReport } from "./helpers/reports";
import { signedWorkflowPayload } from "./helpers/signing";
import {
  postReviewMarginNote,
  replyToMarginComment,
  reviewMargin,
} from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

test.describe("comments", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    const manager = await fetchTestManagerUser(page);
    await loginAsEngineer(page);
    const created = await createReport(page, {
      assignedManagerId: manager.userId,
    });
    reportId = created.id;
    const submitRes = await page.request.post(`/api/reports/${reportId}/submit`, {
      data: signedWorkflowPayload(),
    });
    expect(submitRes.ok(), `submit failed (${submitRes.status()})`).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await loginAsEngineer(page);
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  test("manager posts section comment in review mode", async ({ page }) => {
    await authenticateAsManager(page);
    await page.goto(`/reports/${reportId}/review`);
    await page.setViewportSize({ width: 1280, height: 900 });

    const comment = "Please expand the initial scope section.";
    await postReviewMarginNote(page, "define", comment);
    await expect(reviewMargin(page).getByText(comment)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("rejects comment over character limit", async ({ page }) => {
    const res = await page.request.post(`/api/reports/${reportId}/comments`, {
      data: {
        content: "x".repeat(1025),
        section: "define",
      },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/1024 character limit/i);
  });

  test("engineer replies to manager comment", async ({ page }) => {
    const commentText = "Manager note for reply test.";
    await authenticateAsManager(page);
    const postRes = await page.request.post(`/api/reports/${reportId}/comments`, {
      data: {
        content: commentText,
        section: "define",
      },
    });
    expect(postRes.ok()).toBeTruthy();

    await authenticateAsEngineer(page);
    await page.goto(`/reports/${reportId}/edit`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/edit$`));
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });

    const reply = "Engineer reply to manager note.";
    await replyToMarginComment(page, commentText, reply);
  });
});
