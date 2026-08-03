import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { start } from "workflow/api";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  reportAttachments,
} from "@/db/schema";
import { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";
import { runDocumentIngest } from "@/lib/attachments/run-document-ingest";
import { isTestStubDocumentIngest } from "@/lib/test/ai-bypass";
import { documentIngestWorkflow } from "@/workflows/document-ingest";

export { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";

const ACTIVE_INGEST_STATUSES = ["pending", "running", "ready"] as const;

/**
 * Start document ingest at most once per attachment generation.
 * Concurrent finalize/reprocess callers lose the claim and no-op.
 */
export async function startDocumentIngest(
  attachmentId: string,
  generation: string
): Promise<void> {
  if (isTestStubDocumentIngest()) {
    await markAttachmentReadyForTests(attachmentId, generation);
    return;
  }

  const claimed = await claimDocumentIngestStart(attachmentId, generation);
  if (!claimed) return;

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

/**
 * Serialize ingest starts for one attachment: only the first caller for a
 * generation proceeds while status is still `queued`.
 */
export async function claimDocumentIngestStart(
  attachmentId: string,
  generation: string
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${reportAttachments.id} from ${reportAttachments} where ${reportAttachments.id} = ${attachmentId} for update`
    );

    const [attachment] = await tx
      .select({
        processingStatus: reportAttachments.processingStatus,
        gcsGeneration: reportAttachments.gcsGeneration,
        deletedAt: reportAttachments.deletedAt,
      })
      .from(reportAttachments)
      .where(eq(reportAttachments.id, attachmentId))
      .limit(1);

    if (!attachment || attachment.deletedAt) return false;
    if (
      attachment.gcsGeneration &&
      attachment.gcsGeneration !== generation
    ) {
      return false;
    }
    if (attachment.processingStatus !== "queued") {
      return false;
    }

    const [existingRun] = await tx
      .select({ id: attachmentIngestRuns.id })
      .from(attachmentIngestRuns)
      .where(
        and(
          eq(attachmentIngestRuns.attachmentId, attachmentId),
          eq(attachmentIngestRuns.sourceGeneration, generation),
          inArray(attachmentIngestRuns.status, [...ACTIVE_INGEST_STATUSES])
        )
      )
      .limit(1);
    if (existingRun) return false;

    const [claimed] = await tx
      .update(reportAttachments)
      .set({
        processingStatus: "processing",
        processingProgress: 0,
        processingError: null,
      })
      .where(
        and(
          eq(reportAttachments.id, attachmentId),
          eq(reportAttachments.processingStatus, "queued")
        )
      )
      .returning({ id: reportAttachments.id });

    return Boolean(claimed);
  });
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
  if (error.message.includes("neon-http") || error.message.includes("transactions")) {
    return "Document ingestion failed (database driver)";
  }
  return "Document ingestion could not be started";
}
