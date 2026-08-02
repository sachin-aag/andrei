import { after } from "next/server";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { start } from "workflow/api";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  reportAttachments,
} from "@/db/schema";
import { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";
import { isTestStubDocumentIngest } from "@/lib/test/ai-bypass";
import {
  documentIngestWorkflow,
  runDocumentIngest,
} from "@/workflows/document-ingest";

export { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";

export async function startDocumentIngest(
  attachmentId: string,
  generation: string
): Promise<void> {
  if (isTestStubDocumentIngest()) {
    await markAttachmentReadyForTests(attachmentId, generation);
    return;
  }

  if (resolveDocumentIngestMode() === "inline") {
    after(() =>
      runDocumentIngest(attachmentId, generation).catch(async (error) => {
        console.error("[document-ingest] inline run failed", {
          attachmentId,
          error,
        });
        const message = sanitizeStartError(error);
        await db
          .update(reportAttachments)
          .set({
            processingStatus: "failed",
            processingProgress: 0,
            processingError: message,
          })
          .where(eq(reportAttachments.id, attachmentId));
      })
    );
    return;
  }

  try {
    await start(documentIngestWorkflow, [attachmentId, generation]);
  } catch (error) {
    const message = sanitizeStartError(error);
    await db
      .update(reportAttachments)
      .set({
        processingStatus: "failed",
        processingProgress: 0,
        processingError: message,
      })
      .where(eq(reportAttachments.id, attachmentId));
    throw new Error(message);
  }
}

async function markAttachmentReadyForTests(
  attachmentId: string,
  generation: string
): Promise<void> {
  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId));
  if (!attachment) return;

  const runId = createId();
  await db.insert(attachmentIngestRuns).values({
    id: runId,
    attachmentId,
    reportId: attachment.reportId,
    status: "ready",
    parserVersion: "test-stub",
    extractModelId: "test-stub",
    extractPromptVersion: "test-stub",
    embeddingModelId: "test-stub",
    embeddingDimensions: 768,
    sourceGeneration: generation,
    pageCount: attachment.pageCount ?? 1,
    batchCount: 0,
    completedBatchCount: 0,
    documentSummary: "Deterministic test ingest stub.",
    startedAt: new Date(),
    completedAt: new Date(),
  });

  await db
    .update(reportAttachments)
    .set({
      processingStatus: "ready",
      processingProgress: 100,
      processingError: null,
      activeIngestRunId: runId,
      gcsGeneration: generation,
    })
    .where(eq(reportAttachments.id, attachmentId));
}

function sanitizeStartError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Document ingestion could not be started";
  }
  if (error.message.includes("workflow") || error.message.includes("Workflow")) {
    return "Document ingestion workflow could not be started";
  }
  return "Document ingestion could not be started";
}
