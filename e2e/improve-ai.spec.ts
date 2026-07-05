import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAsTestUser, scopedTestEmail } from "./helpers/auth";
import { TEST_ENGINEER_EMAIL } from "./helpers/signing";
import {
  createReport,
  deleteReport,
  seedDefineForEvaluation,
} from "./helpers/reports";

const fixturePath = path.join(
  process.cwd(),
  "e2e/fixtures/minimal-report.docx"
);

async function loginAsProjectEngineer(
  page: Page,
  projectName: string
): Promise<void> {
  await loginAsTestUser(page, {
    email: scopedTestEmail(TEST_ENGINEER_EMAIL, projectName),
    role: "engineer",
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /my reports/i })).toBeVisible({
    timeout: 30_000,
  });
}

async function waitForSessionReady(page: Page, sessionId: string) {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/improve-ai/sessions/${sessionId}`);
        if (!res.ok()) return "error";
        const body = (await res.json()) as { session: { status: string } };
        return body.session.status;
      },
      { timeout: 120_000 }
    )
    .toBe("ready_for_review");
}

test.describe.configure({ mode: "serial" });

test.describe("improve ai", () => {
  let reportId: string | null = null;
  let sessionId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (reportId) {
      await deleteReport(page, reportId);
      reportId = null;
    }
    sessionId = null;
  });

  test("shows empty state on list page", async ({ page }, testInfo) => {
    await loginAsProjectEngineer(page, testInfo.project.name);
    await page.goto("/improve-ai");
    await expect(page.getByText(/no ai feedback sessions yet/i)).toBeVisible();
    await expect(page.getByText(/evaluate report/i).first()).toBeVisible();
  });

  test("creates session from existing report", async ({ page }, testInfo) => {
    await loginAsProjectEngineer(page, testInfo.project.name);
    const created = await createReport(page);
    reportId = created.id;
    await seedDefineForEvaluation(page, reportId);

    await page.goto("/improve-ai");
    await page.getByRole("button", { name: /evaluate report/i }).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(created.deviationNo) }).click();
    await page.getByRole("button", { name: /^evaluate$/i }).click();

    await expect(page).toHaveURL(/\/improve-ai\/[^/]+/, { timeout: 60_000 });
    const match = page.url().match(/\/improve-ai\/([^/]+)/);
    sessionId = match?.[1] ?? null;
    await expect(page.getByText(/agree with evaluation\?/i).first()).toBeVisible({
      timeout: 60_000,
    });
  });

  test("agrees with a criterion on review page", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAsProjectEngineer(page, testInfo.project.name);
    const created = await createReport(page);
    reportId = created.id;
    await seedDefineForEvaluation(page, reportId);

    const startRes = await page.request.post("/api/improve-ai/from-report", {
      data: { reportId },
    });
    expect(startRes.ok()).toBeTruthy();
    const { sessionId: sid } = (await startRes.json()) as { sessionId: string };
    sessionId = sid;
    await waitForSessionReady(page, sessionId);

    await page.goto(`/improve-ai/${sessionId}`);
    await expect(page.getByText(/agree with evaluation\?/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("radio", { name: /^yes$/i }).first().click();
    await page.getByRole("radio", { name: /^yes$/i }).nth(1).click();

    await expect
      .poll(async () => {
        const viewRes = await page.request.get(`/api/improve-ai/sessions/${sessionId}`);
        return viewRes.ok();
      })
      .toBe(true);
  });

  test("completes session after reviewing all criteria", async ({ page }, testInfo) => {
    await loginAsProjectEngineer(page, testInfo.project.name);
    const created = await createReport(page);
    reportId = created.id;
    await seedDefineForEvaluation(page, reportId);

    const startRes = await page.request.post("/api/improve-ai/from-report", {
      data: { reportId },
    });
    const { sessionId: sid } = (await startRes.json()) as { sessionId: string };
    sessionId = sid;
    await waitForSessionReady(page, sessionId);

    const viewRes = await page.request.get(`/api/improve-ai/sessions/${sessionId}`);
    const { session } = (await viewRes.json()) as {
      session: {
        sections: Array<{
          section: string;
          criteria: Array<{ criterionKey: string }>;
        }>;
      };
    };

    const answers = session.sections.flatMap((section) =>
      section.criteria.map((criterion) => ({
        section: section.section,
        criterionKey: criterion.criterionKey,
        criteriaEvaluationAgreement: "yes",
        reasoningAgreement: "yes",
      }))
    );

    const completeRes = await page.request.patch(
      `/api/improve-ai/sessions/${sessionId}`,
      { data: { answers, complete: true } }
    );
    expect(completeRes.ok()).toBeTruthy();

    await page.goto("/improve-ai");
    await expect(page.getByText(/reviewed/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("uploads docx to create session", async ({ page }, testInfo) => {
    await loginAsProjectEngineer(page, testInfo.project.name);
    await page.goto("/improve-ai");
    await page.getByRole("button", { name: /evaluate report/i }).click();
    await page.locator("#improve-ai-file").setInputFiles(fixturePath);
    await expect(page.locator("#improve-ai-deviation")).not.toHaveValue("", {
      timeout: 30_000,
    });
    const uploadButton = page.getByRole("button", { name: /upload & evaluate/i });
    await expect(uploadButton).toBeEnabled({ timeout: 30_000 });
    await uploadButton.click();
    await expect(page).toHaveURL(/\/improve-ai\/[^/]+/, { timeout: 120_000 });

    const match = page.url().match(/\/improve-ai\/([^/]+)/);
    sessionId = match?.[1] ?? null;
    const viewRes = await page.request.get(`/api/improve-ai/sessions/${sessionId}`);
    expect(viewRes.ok()).toBeTruthy();
    const { session } = (await viewRes.json()) as { session: { reportId: string } };
    reportId = session.reportId;
  });
});
