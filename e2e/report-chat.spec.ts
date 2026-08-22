import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { loginAsEngineer } from "./helpers/auth";
import { reloadWithNavigationRetry } from "./helpers/navigation";
import { createReport, deleteReport } from "./helpers/reports";
import {
  documentsPanel,
  expandDocumentsPanel,
  openReportAssistant,
  reportSidebar,
} from "./helpers/workspace";

test.describe.configure({ mode: "serial" });

async function uploadPdf(page: Page): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  const bytes = await pdf.save();
  const fileName = `evidence-${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.pdf`;

  const panel = documentsPanel(page);
  const fileInput = panel.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  const uploadUrlResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/attachments/upload-url") &&
      response.request().method() === "POST",
    { timeout: 30_000 }
  );

  await fileInput.setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });

  const reservation = await uploadUrlResponse;
  expect(
    reservation.ok(),
    `upload-url failed: ${reservation.status()} ${await reservation.text()}`
  ).toBe(true);

  await expect(panel.getByText(fileName)).toBeVisible({ timeout: 30_000 });
  return fileName;
}

test.describe("report chat", () => {
  let reportId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
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
      await deleteReport(page, reportId);
      reportId = null;
    }
  });

  // Tool selection is not assertable here because buildStubChatModel scripts
  // the tool calls. This spec only proves a chat turn streams and persists
  // when a ready attachment is on the report.
  test("streams a chat reply when a ready attachment is on the report", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await expandDocumentsPanel(page);
    await uploadPdf(page);
    await expect(
      documentsPanel(page).locator('[data-document-file][data-status="ready"]')
    ).toBeVisible({ timeout: 30_000 });

    await openReportAssistant(page);
    const sidebar = reportSidebar(page);
    await sidebar.getByLabel("Assistant mode").click();
    await page.getByRole("option", { name: /^ask$/i }).click();

    const composer = sidebar.getByPlaceholder(/describe the deviation/i);
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("help me start this report");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();

    await expect(sidebar.getByText("help me start this report")).toBeVisible({
      timeout: 15_000,
    });
    await expect(sidebar.getByText(/^assistant$/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(sidebar.getByText(/before i draft anything/i)).toBeVisible({
      timeout: 30_000,
    });

    await reloadWithNavigationRetry(page, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/edit`));
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
    await openReportAssistant(page);
    await expect(
      reportSidebar(page).getByText(/before i draft anything/i)
    ).toBeVisible({ timeout: 30_000 });
  });

  test("starting a new chat while a turn is in flight leaves the composer usable", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    let chatTurnPosts = 0;
    await page.route(
      (url) => /\/api\/reports\/[^/]+\/chat$/.test(new URL(url).pathname),
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        chatTurnPosts += 1;
        if (chatTurnPosts === 1) {
          await new Promise((resolve) => setTimeout(resolve, 8_000));
        }
        await route.continue();
      }
    );

    await openReportAssistant(page);
    const sidebar = reportSidebar(page);
    await sidebar.getByLabel("Assistant mode").click();
    await page.getByRole("option", { name: /^ask$/i }).click();

    const composer = sidebar.getByPlaceholder(/describe the deviation/i);
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("first concurrent chat ping");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();

    await expect(sidebar.getByText("first concurrent chat ping")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      sidebar.getByRole("button", { name: /^stop generating$/i })
    ).toBeVisible();

    await sidebar.getByRole("button", { name: /^new chat$/i }).click();

    await expect(sidebar.getByText("first concurrent chat ping")).toHaveCount(0);
    await expect(
      sidebar.getByRole("button", { name: /^stop generating$/i })
    ).toHaveCount(0);
    await expect(
      sidebar.getByRole("button", { name: /^send message$/i })
    ).toBeVisible();
    const newComposer = sidebar.getByPlaceholder(/describe the deviation/i);
    await expect(newComposer).toBeEnabled({ timeout: 15_000 });

    await newComposer.fill("second concurrent chat ping");
    await expect(
      sidebar.getByRole("button", { name: /^send message$/i })
    ).toBeEnabled({ timeout: 15_000 });
    await sidebar.getByRole("button", { name: /^send message$/i }).click();

    await expect(sidebar.getByText("second concurrent chat ping")).toBeVisible({
      timeout: 15_000,
    });
    await expect(sidebar.getByText("first concurrent chat ping")).toHaveCount(0);

    await sidebar.getByRole("button", { name: /^chat history$/i }).click();
    await expect(sidebar.getByText(/still working/i)).toBeVisible({
      timeout: 5_000,
    });
  });
});
