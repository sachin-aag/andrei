import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { loginAsEngineer } from "./helpers/auth";
import { reloadWithNavigationRetry } from "./helpers/navigation";
import { createReport, deleteReport, seedDefineForEvaluation } from "./helpers/reports";
import {
  chatUserMessage,
  collapseReportSidebar,
  defineEditor,
  documentsPanel,
  expandDocumentsPanel,
  expandReportSidebar,
  openReportAssistant,
  openReportEditor,
  reportSidebar,
  setReportChrome,
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
    await openReportEditor(page, reportId);
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

    const composer = sidebar.getByPlaceholder(/ask about the report or attachments/i);
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("help me start this report");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();

    await expect(chatUserMessage(page, "help me start this report")).toBeVisible({
      timeout: 15_000,
    });
    await expect(sidebar.getByText(/out-of-spec dissolution result/i)).toBeVisible({
      timeout: 30_000,
    });

    await collapseReportSidebar(page);
    await expandReportSidebar(page);
    await expect(
      reportSidebar(page).getByText(/out-of-spec dissolution result/i)
    ).toBeVisible({ timeout: 5_000 });

    await reloadWithNavigationRetry(page, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/reports/${reportId}/edit`));
    await expect(page.getByRole("heading", { name: /^define$/i })).toBeVisible({
      timeout: 30_000,
    });
    await openReportAssistant(page);
    await expect(
      reportSidebar(page).getByText(/out-of-spec dissolution result/i)
    ).toBeVisible({ timeout: 30_000 });
  });

  test("warns in chat while a document is uploading without blocking send", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    let releaseFinalize = () => {};
    const finalizeReleased = new Promise<void>((resolve) => {
      releaseFinalize = resolve;
    });
    let finalizeSettled = Promise.resolve();

    await page.route(
      (url) =>
        /\/api\/reports\/[^/]+\/attachments\/[^/]+\/finalize$/.test(
          new URL(url).pathname
        ),
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        finalizeSettled = (async () => {
          await finalizeReleased;
          try {
            await route.continue();
          } catch {
            // Page already closed.
          }
        })();
      }
    );

    try {
      await expandDocumentsPanel(page);
      await openReportAssistant(page);
      const sidebar = reportSidebar(page);
      await uploadPdf(page);

      const composer = sidebar.getByPlaceholder(
        /ask about the report or attachments|ask the assistant/i
      );
      await expect(composer).toBeEnabled({ timeout: 15_000 });
      await expect(
        sidebar.getByTestId("document-uploading-notice")
      ).toHaveCount(0);

      await composer.fill("what does this file say");
      const notice = sidebar.getByTestId("document-uploading-notice");
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText(
        /document is uploading and will not be available until processing is complete/i
      );

      const send = sidebar.getByRole("button", { name: /^send message$/i });
      await expect(send).toBeEnabled();
      await send.click();
      await expect(
        chatUserMessage(page, "what does this file say")
      ).toBeVisible({ timeout: 15_000 });
      await expect(notice).toBeVisible();

      releaseFinalize();
      await expect(
        documentsPanel(page).locator('[data-document-file][data-status="ready"]')
      ).toBeVisible({ timeout: 30_000 });
      await expect(notice).toHaveCount(0);
    } finally {
      releaseFinalize();
      await finalizeSettled;
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  test("starting a new chat while a turn is in flight leaves the composer usable", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    let chatTurnPosts = 0;
    let releaseFirstPost = () => {};
    const firstPostReleased = new Promise<void>((resolve) => {
      releaseFirstPost = resolve;
    });
    let firstPostSettled = Promise.resolve();

    await page.route(
      (url) => /\/api\/reports\/[^/]+\/chat$/.test(new URL(url).pathname),
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        chatTurnPosts += 1;
        if (chatTurnPosts === 1) {
          // Hold the first turn in the browser. Do not `continue()` it after
          // an 8s timer — Playwright teardown then forwards a half-open POST
          // that leaves `next start` stuck on `req.json()` and starves later
          // browsers (WebKit homepage timeouts).
          firstPostSettled = (async () => {
            await firstPostReleased;
            try {
              await route.abort("failed");
            } catch {
              // Page already closed.
            }
          })();
          return;
        }
        await route.continue();
      }
    );

    try {
      await openReportAssistant(page);
      const sidebar = reportSidebar(page);
      await sidebar.getByLabel("Assistant mode").click();
      await page.getByRole("option", { name: /^ask$/i }).click();

      const composer = sidebar.getByPlaceholder(/ask about the report or attachments/i);
      await expect(composer).toBeEnabled({ timeout: 15_000 });
      await composer.fill("first concurrent chat ping");
      await sidebar.getByRole("button", { name: /^send message$/i }).click();

      await expect(chatUserMessage(page, "first concurrent chat ping")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        sidebar.getByRole("button", { name: /^stop generating$/i })
      ).toBeVisible();

      await sidebar.getByRole("button", { name: /^new chat$/i }).click();

      const tabs = sidebar.getByRole("tablist", { name: /open chats/i });
      await expect(tabs).toBeVisible();
      await expect(tabs.getByRole("tab")).toHaveCount(2);
      await expect(
        tabs.getByRole("tab", { name: /still working/i })
      ).toBeVisible();

      await expect(chatUserMessage(page, "first concurrent chat ping")).toHaveCount(
        0
      );
      await expect(
        sidebar.getByRole("button", { name: /^stop generating$/i })
      ).toHaveCount(0);
      await expect(
        sidebar.getByRole("button", { name: /^send message$/i })
      ).toBeVisible();
      const newComposer = sidebar.getByPlaceholder(/ask about the report or attachments/i);
      await expect(newComposer).toBeEnabled({ timeout: 15_000 });

      await newComposer.fill("second concurrent chat ping");
      await expect(
        sidebar.getByRole("button", { name: /^send message$/i })
      ).toBeEnabled({ timeout: 15_000 });
      await sidebar.getByRole("button", { name: /^send message$/i }).click();

      await expect(
        chatUserMessage(page, "second concurrent chat ping")
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect(chatUserMessage(page, "first concurrent chat ping")).toHaveCount(
        0
      );

      await sidebar.getByRole("button", { name: /^chat history$/i }).click();
      // The parked first thread is still in flight. The second may also still be
      // streaming, so do not require a single match.
      await expect(sidebar.getByText(/still working/i).first()).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      releaseFirstPost();
      await firstPostSettled;
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });

  test("closing a chat tab leaves it in history so it can be reopened", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openReportAssistant(page);
    const sidebar = reportSidebar(page);
    await sidebar.getByLabel("Assistant mode").click();
    await page.getByRole("option", { name: /^ask$/i }).click();

    const composer = sidebar.getByPlaceholder(/ask about the report or attachments/i);
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("first chat for close test");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();
    await expect(chatUserMessage(page, "first chat for close test")).toBeVisible({
      timeout: 15_000,
    });

    await sidebar.getByRole("button", { name: /^new chat$/i }).click();
    const tabs = sidebar.getByRole("tablist", { name: /open chats/i });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("tab")).toHaveCount(2);

    await tabs.getByRole("button", { name: /close first chat for close test/i }).click();
    await expect(tabs.getByRole("tab")).toHaveCount(1);
    await expect(chatUserMessage(page, "first chat for close test")).toHaveCount(0);

    await sidebar.getByRole("button", { name: /^chat history$/i }).click();
    await sidebar
      .getByRole("button", { name: /first chat for close test/i })
      .click();
    await expect(chatUserMessage(page, "first chat for close test")).toBeVisible({
      timeout: 15_000,
    });
    await expect(tabs.getByRole("tab")).toHaveCount(2);
    await expect(
      tabs.getByRole("button", { name: /close first chat for close test/i })
    ).toBeVisible();
  });

  test("keeps the document assistant open after a generated suggestion lands", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await setReportChrome(page, "document");
    await seedDefineForEvaluation(page, reportId!);
    await openReportAssistant(page);
    const sidebar = reportSidebar(page);
    const mode = sidebar.getByLabel("Assistant mode");
    await expect(mode).toBeVisible({ timeout: 15_000 });
    if (!/agent/i.test((await mode.textContent()) ?? "")) {
      await mode.click();
      await page.getByRole("option", { name: /^agent$/i }).click();
    }

    const composer = sidebar.getByPlaceholder(
      /ask the assistant to draft or improve a section/i
    );
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill("draft define");
    await sidebar.getByRole("button", { name: /^send message$/i }).click();

    await expect(chatUserMessage(page, "draft define")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      sidebar.getByText(/review the highlighted insertion/i)
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      defineEditor(page)
        .locator(".suggestion-insert")
        .filter({ hasText: /stubbed drafting insertion/i })
    ).toBeVisible({ timeout: 30_000 });

    // The focus effect used to collapse the assistant on the next tick.
    await page.waitForTimeout(500);
    await expect(
      sidebar.getByRole("button", { name: /collapse sidebar/i })
    ).toBeVisible();
    await expect(composer).toBeVisible();
    await expect(composer).toBeEnabled();
  });
});
