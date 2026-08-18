import { after } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { start } from "workflow/api";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  documentChunks,
  documentPages,
  reportAttachments,
} from "@/db/schema";
import { chunkDocumentPages } from "@/lib/attachments/chunk-pages";
import { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";
import {
  sanitizeIngestError,
  shouldBackfillIngestFailure,
} from "@/lib/attachments/ingest-errors";
import { runDocumentIngest } from "@/lib/attachments/run-document-ingest";
import { isTestStubDocumentIngest } from "@/lib/test/ai-bypass";
import { documentIngestWorkflow } from "@/workflows/document-ingest";

export { resolveDocumentIngestMode } from "@/lib/attachments/document-ingest-mode";
export { shouldBackfillIngestFailure } from "@/lib/attachments/ingest-errors";

const ACTIVE_INGEST_STATUSES = ["pending", "running"] as const;

/**
 * Start document ingest at most once per in-flight attachment generation.
 * A completed `ready` run does not block an explicit retry.
 *
 * Prefers Vercel Workflows when configured; if `start()` fails (common when
 * World/Queues are unhealthy), falls back to inline `after()` ingest so
 * uploads do not stick on "Document ingestion could not be started".
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
    scheduleInlineIngest(attachmentId, generation);
    return;
  }

  try {
    await start(documentIngestWorkflow, [attachmentId, generation]);
  } catch (error) {
    console.error(
      "[document-ingest] workflow start failed; falling back to inline",
      { attachmentId, error }
    );
    scheduleInlineIngest(attachmentId, generation);
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

function scheduleInlineIngest(attachmentId: string, generation: string): void {
  after(() =>
    runDocumentIngest(attachmentId, generation).catch(async (error) => {
      console.error("[document-ingest] inline run failed", {
        attachmentId,
        error,
      });
      // runDocumentIngest already marks failed via markRunTerminal — do not
      // overwrite that message with a generic "could not be started".
      await ensureFailedIfStillInFlight(attachmentId, error);
    })
  );
}

/**
 * Safety net when ingest crashes before markRunTerminal can persist failure.
 * Skips rows that already have a failed/ready terminal status.
 */
export async function ensureFailedIfStillInFlight(
  attachmentId: string,
  error: unknown
): Promise<void> {
  const [row] = await db
    .select({
      processingStatus: reportAttachments.processingStatus,
      processingError: reportAttachments.processingError,
    })
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId))
    .limit(1);

  if (!row || !shouldBackfillIngestFailure(row)) return;

  await db
    .update(reportAttachments)
    .set({
      processingStatus: "failed",
      processingProgress: 0,
      processingError: sanitizeIngestError(error),
    })
    .where(eq(reportAttachments.id, attachmentId));
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
  const pageId = createId();
  const pageCount = attachment.pageCount ?? 1;
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
    pageCount,
    batchCount: 0,
    completedBatchCount: 0,
    documentSummary: "Deterministic test ingest stub.",
    startedAt: new Date(),
    completedAt: new Date(),
  });

  await db.insert(documentPages).values({
    id: pageId,
    ingestRunId: runId,
    attachmentId,
    reportId: attachment.reportId,
    pageNumber: 1,
    printedPageLabel: "1",
    transcript:
      "Batch B-441 failed dissolution at 68 percent versus the 80 percent specification.",
    visualInterpretation: "",
    pageContext: "Dissolution COA for the failed batch.",
  });

  const chunks = chunkDocumentPages({
    filename: attachment.filename,
    pages: [
      {
        id: pageId,
        pageNumber: 1,
        transcript:
          "Batch B-441 failed dissolution at 68 percent versus the 80 percent specification.",
        visualInterpretation: "",
        pageContext: "Dissolution COA for the failed batch.",
      },
    ],
  });
  if (chunks[0]) {
    await db.insert(documentChunks).values({
      ingestRunId: runId,
      attachmentId,
      reportId: attachment.reportId,
      pageId: chunks[0].pageId,
      pageNumber: chunks[0].pageNumber,
      ordinal: chunks[0].ordinal,
      rawText: chunks[0].rawText,
      contextualText: chunks[0].contextualText,
      sourceKind: chunks[0].sourceKind,
      embedding: null,
    });
  }

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
