import { expect, test, type Page } from "@playwright/test";
import { loginAsTestUser, scopedTestEmail } from "./helpers/auth";
import { TEST_ENGINEER_EMAIL } from "./helpers/signing";
import { applySampleAssay } from "@/lib/statistical-analysis/sample-data";
import { createEmptyWorksheet } from "@/lib/statistical-analysis/worksheet";

function projectEngineerEmail(projectName: string): string {
  return scopedTestEmail(TEST_ENGINEER_EMAIL, `${projectName}-stats`);
}

async function loginAsProjectEngineer(
  page: Page,
  projectName: string
): Promise<void> {
  await loginAsTestUser(page, {
    email: projectEngineerEmail(projectName),
    role: "engineer",
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /my reports/i })).toBeVisible({
    timeout: 30_000,
  });
}

async function deleteAllWorkspaces(page: Page): Promise<void> {
  const res = await page.request.get("/api/statistical-analysis/workspaces");
  if (!res.ok()) return;
  const body = (await res.json()) as { workspaces: { id: string }[] };
  for (const workspace of body.workspaces ?? []) {
    await page.request.delete(
      `/api/statistical-analysis/workspaces/${workspace.id}`
    );
  }
}

async function openNormalSixpackDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Stat" }).click();
  const quality = page.getByRole("menuitem", { name: "Quality Tools" });
  await quality.hover();
  await quality.click();
  const sixpack = page.getByRole("menuitem", { name: "Capability Sixpack" });
  await sixpack.hover();
  await sixpack.click();
  await page.getByTestId("stat-normal-sixpack").click();
  await expect(page.getByTestId("capability-dialog")).toBeVisible();
}

test.describe("statistical analysis", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await loginAsProjectEngineer(page, testInfo.project.name);
    await deleteAllWorkspaces(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteAllWorkspaces(page);
  });

  test("shows empty state and creates a worksheet from the list", async ({
    page,
  }) => {
    await page.goto("/statistical-analysis");
    await expect(
      page.getByRole("heading", { name: "Statistical Analysis" })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no worksheets yet/i)).toBeVisible();

    await page.getByRole("button", { name: /new worksheet/i }).click();
    await expect(page).toHaveURL(/\/statistical-analysis\/[^/]+/, {
      timeout: 30_000,
    });
    await expect(page.getByTestId("worksheet-grid")).toBeVisible();
  });

  test("loads sample assay and runs a Normal Capability Sixpack", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/statistical-analysis");
    await page.getByRole("button", { name: /new worksheet/i }).click();
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Data" }).click();
    await page.getByTestId("load-sample-assay").click();
    await expect(page.getByTestId("cell-c1-0")).toHaveText("101.84");
    await expect(page.getByTestId("column-header-c1")).toHaveText("Assay");

    await openNormalSixpackDialog(page);
    await page.getByTestId("sixpack-lsl").fill("90");
    await page.getByTestId("sixpack-usl").fill("110");
    await page.getByTestId("sixpack-target").fill("100");
    await page.getByRole("dialog").getByRole("button", { name: /^ok$/i }).click();

    await expect(page.getByTestId("capability-sixpack")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/process capability sixpack of assay/i)).toBeVisible();
    await expect(page.getByText("Cpk")).toBeVisible();
    await expect(page.getByTestId("analysis-list")).toBeVisible();
  });

  test("marks a sixpack stale after the source column changes", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    const created = await page.request.post(
      "/api/statistical-analysis/workspaces",
      { data: { name: "Assay API" } }
    );
    expect(created.ok()).toBeTruthy();
    const createdBody = (await created.json()) as { workspace: { id: string } };
    const workspaceId = createdBody.workspace.id;

    const patched = await page.request.patch(
      `/api/statistical-analysis/workspaces/${workspaceId}`,
      { data: { worksheet: sheet } }
    );
    expect(patched.ok()).toBeTruthy();

    const analyzed = await page.request.post(
      `/api/statistical-analysis/workspaces/${workspaceId}/analyses`,
      {
        data: {
          columnId: "c1",
          title: "Assay",
          lsl: 90,
          usl: 110,
          target: 100,
        },
      }
    );
    expect(analyzed.ok()).toBeTruthy();

    await page.goto(`/statistical-analysis/${workspaceId}`);
    await expect(page.getByTestId("worksheet-grid")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("workspace-tab-results").click();
    await expect(page.getByTestId("capability-sixpack")).toBeVisible();
    await expect(page.getByText("Stale")).toHaveCount(0);

    await page.getByTestId("workspace-tab-worksheet").click();
    await page.getByTestId("cell-c1-0").click();
    await page.keyboard.type("99.00");
    await page.keyboard.press("Enter");

    await page.getByTestId("workspace-tab-results").click();
    await expect(page.getByText("Stale").first()).toBeVisible();
    await page.getByRole("button", { name: /^recompute$/i }).click();
    await expect(page.getByText("Stale")).toHaveCount(0, { timeout: 30_000 });
  });
});
