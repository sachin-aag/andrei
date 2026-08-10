import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import mammoth from "mammoth";
import { db } from "@/db";
import {
  attachmentIngestRuns,
  documentChunks,
  documentIngestBatches,
  documentPages,
  reportAttachments,
  type AttachmentIngestRunStatus,
} from "@/db/schema";
import { chunkDocumentPages } from "@/lib/attachments/chunk-pages";
import {
  DEFAULT_DOCUMENT_EMBEDDING_MODEL_ID,
  embedDocumentChunks,
} from "@/lib/attachments/embed-chunks";
import {
  DEFAULT_DOCUMENT_EXTRACT_MODEL_ID,
  DOCUMENT_EXTRACT_PROMPT_VERSION,
  extractPdfBatch,
} from "@/lib/attachments/extract-batch";
import { type AttachmentKind, kindFromMime } from "@/lib/attachments/file-types";
import {
  isCancelledIngestError,
  sanitizeIngestError,
} from "@/lib/attachments/ingest-errors";
import { splitPdfIntoBatches } from "@/lib/attachments/pdf-split";
import { getAttachmentStorage, tempBatchObjectKey } from "@/lib/storage/attachments";

export { sanitizeIngestError } from "@/lib/attachments/ingest-errors";

const PARSER_VERSION = "v2";
const SUMMARY_MAX_CHARS = 12_000;
const FAILED_ATTACHMENT_PROGRESS = 0;
/** DOCX has no page model; split extracted text into readable pseudo-pages. */
const DOCX_PSEUDO_PAGE_CHARS = 6_000;

type IngestInit = {
  runId: string;
  attachmentId: string;
  reportId: string;
  filename: string;
  kind: AttachmentKind;
  sourceObjectKey: string;
  sourceGeneration: string;
  extractModelId: string;
  embeddingModelId: string;
};

type BatchProcessResult = {
  batchId: string;
  pageCount: number;
};

/**
 * PDF extract → chunk → embed pipeline (Node.js). Used by preview `after()`
 * ingest and by the Workflow `"use step"` wrapper — keep this free of
 * `"use workflow"` / `"use step"` so the workflow bundler never pulls Node
 * modules into the sandbox.
 */
export async function runDocumentIngest(
  attachmentId: string,
  generation: string
): Promise<void> {
  let init: IngestInit | null = null;
  try {
    init = await initializeIngestRun(attachmentId, generation);
    if (!init) return;
    if (init.kind === "docx") {
      await runDocxIngest(init);
    } else {
      await runPdfIngest(init);
    }
  } catch (error) {
    await markRunTerminal({
      runId: init?.runId ?? null,
      attachmentId,
      generation,
      status: isCancelledIngestError(error) ? "cancelled" : "failed",
      message: sanitizeIngestError(error),
    });
    throw error;
  } finally {
    if (init) {
      await cleanupTempObjects(init.runId);
    }
  }
}

async function initializeIngestRun(
  attachmentId: string,
  generation: string
): Promise<IngestInit | null> {
  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    throw new Error("Attachment not found");
  }
  if (attachment.deletedAt) {
    throw cancelledError("Attachment was deleted before ingestion started");
  }
  if (!attachment.gcsGeneration || attachment.gcsGeneration !== generation) {
    throw new Error("Attachment source changed before ingestion started");
  }

  const runId = createId();
  const extractModelId =
    process.env.DOCUMENT_EXTRACT_GOOGLE_MODEL_ID?.trim() ||
    DEFAULT_DOCUMENT_EXTRACT_MODEL_ID;
  const embeddingModelId =
    process.env.DOCUMENT_EMBEDDING_MODEL_ID?.trim() ||
    DEFAULT_DOCUMENT_EMBEDDING_MODEL_ID;

  const started = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${reportAttachments.id} from ${reportAttachments} where ${reportAttachments.id} = ${attachmentId} for update`
    );

    const [existingRun] = await tx
      .select({ id: attachmentIngestRuns.id })
      .from(attachmentIngestRuns)
      .where(
        and(
          eq(attachmentIngestRuns.attachmentId, attachmentId),
          eq(attachmentIngestRuns.sourceGeneration, generation),
          inArray(attachmentIngestRuns.status, ["pending", "running", "ready"])
        )
      )
      .limit(1);
    if (existingRun) return false;

    await tx.insert(attachmentIngestRuns).values({
      id: runId,
      attachmentId: attachment.id,
      reportId: attachment.reportId,
      status: "running",
      parserVersion: PARSER_VERSION,
      extractModelId,
      extractPromptVersion: DOCUMENT_EXTRACT_PROMPT_VERSION,
      embeddingModelId,
      embeddingDimensions: 768,
      sourceGeneration: generation,
      startedAt: new Date(),
    });
    await tx
      .update(reportAttachments)
      .set({
        processingStatus: "processing",
        processingProgress: 0,
        processingError: null,
      })
      .where(eq(reportAttachments.id, attachment.id));
    return true;
  });

  if (!started) return null;

  return {
    runId,
    attachmentId: attachment.id,
    reportId: attachment.reportId,
    filename: attachment.filename,
    kind: kindFromMime(attachment.mimeType) ?? "pdf",
    sourceObjectKey: attachment.permanentObjectKey,
    sourceGeneration: generation,
    extractModelId,
    embeddingModelId,
  };
}

/** PDF path: split into batches, Gemini-vision extract each, then chunk+embed. */
async function runPdfIngest(init: IngestInit): Promise<void> {
  await assertAttachmentCurrent(init);
  await splitAndPersistBatches(init);
  const batchIds = await listBatchIds(init.runId);

  for (const batchId of batchIds) {
    await assertAttachmentCurrent(init);
    await processBatch(batchId);
    await updateBatchProgress(init.runId, init.attachmentId);
  }

  await assertAttachmentCurrent(init);
  await buildDocumentSummary(init.runId);
  await chunkAndEmbedRun(init);
  await assertAttachmentCurrent(init);
  await markRunReady(init);
}

/**
 * DOCX path: extract text with mammoth (no Gemini vision — a .docx is not a
 * visual format), lay it out as pseudo-pages, then reuse the exact same
 * chunk→embed→ready machinery as PDFs so the content is searchable identically.
 */
async function runDocxIngest(init: IngestInit): Promise<void> {
  await assertAttachmentCurrent(init);
  const buffer = await getAttachmentStorage().readObjectBuffer(
    init.sourceObjectKey
  );
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const pages = buildDocxPseudoPages(rawText);

  await db.transaction(async (tx) => {
    await tx
      .delete(documentPages)
      .where(eq(documentPages.ingestRunId, init.runId));
    if (pages.length > 0) {
      await tx.insert(documentPages).values(
        pages.map((page) => ({
          ingestRunId: init.runId,
          attachmentId: init.attachmentId,
          reportId: init.reportId,
          pageNumber: page.pageNumber,
          printedPageLabel: null,
          transcript: page.text,
          visualInterpretation: "",
          pageContext: init.filename,
          confidence: null,
        }))
      );
    }
  });

  await db
    .update(attachmentIngestRuns)
    .set({
      pageCount: pages.length,
      batchCount: 0,
      documentSummary: rawText.trim().slice(0, SUMMARY_MAX_CHARS),
    })
    .where(eq(attachmentIngestRuns.id, init.runId));
  await db
    .update(reportAttachments)
    .set({ pageCount: Math.max(1, pages.length), processingProgress: 80 })
    .where(eq(reportAttachments.id, init.attachmentId));

  await assertAttachmentCurrent(init);
  await chunkAndEmbedRun(init);
  await assertAttachmentCurrent(init);
  await markRunReady(init);
}

/** Split extracted DOCX text into ~page-sized windows on paragraph breaks. */
function buildDocxPseudoPages(
  rawText: string
): Array<{ pageNumber: number; text: string }> {
  const paragraphs = rawText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const pages: Array<{ pageNumber: number; text: string }> = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > DOCX_PSEUDO_PAGE_CHARS && current) {
      pages.push({ pageNumber: pages.length + 1, text: current });
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) {
    pages.push({ pageNumber: pages.length + 1, text: current });
  }
  return pages;
}

async function assertAttachmentCurrent(input: IngestInit): Promise<void> {
  const [attachment] = await db
    .select({
      deletedAt: reportAttachments.deletedAt,
      gcsGeneration: reportAttachments.gcsGeneration,
    })
    .from(reportAttachments)
    .where(eq(reportAttachments.id, input.attachmentId))
    .limit(1);

  if (!attachment || attachment.deletedAt) {
    throw cancelledError("Attachment was deleted during ingestion");
  }
  if (attachment.gcsGeneration !== input.sourceGeneration) {
    throw cancelledError("Attachment source changed during ingestion");
  }
}

async function splitAndPersistBatches(input: IngestInit): Promise<{
  batchCount: number;
  pageCount: number;
}> {
  const storage = getAttachmentStorage();
  const sourceBuffer = await storage.readObjectBuffer(input.sourceObjectKey);
  const split = await splitPdfIntoBatches(sourceBuffer);

  for (const batch of split.batches) {
    const objectKey = tempBatchObjectKey(
      input.attachmentId,
      input.runId,
      batch.batchIndex
    );
    await storage.writeObjectBuffer(
      objectKey,
      batch.buffer,
      "application/pdf"
    );
    await db
      .insert(documentIngestBatches)
      .values({
        ingestRunId: input.runId,
        attachmentId: input.attachmentId,
        reportId: input.reportId,
        batchIndex: batch.batchIndex,
        pageStart: batch.pageStart,
        pageEnd: batch.pageEnd,
        stepKey: `${input.runId}:batch:${batch.batchIndex}`,
        tempObjectKey: objectKey,
        status: "pending",
      })
      .onConflictDoNothing({
        target: [
          documentIngestBatches.ingestRunId,
          documentIngestBatches.batchIndex,
        ],
      });
  }

  await db
    .update(attachmentIngestRuns)
    .set({
      pageCount: split.pageCount,
      batchCount: split.batches.length,
    })
    .where(eq(attachmentIngestRuns.id, input.runId));
  await db
    .update(reportAttachments)
    .set({
      pageCount: split.pageCount,
      processingProgress: 10,
    })
    .where(eq(reportAttachments.id, input.attachmentId));

  return { batchCount: split.batches.length, pageCount: split.pageCount };
}

async function listBatchIds(runId: string): Promise<string[]> {
  const batches = await db
    .select({ id: documentIngestBatches.id })
    .from(documentIngestBatches)
    .where(eq(documentIngestBatches.ingestRunId, runId))
    .orderBy(asc(documentIngestBatches.batchIndex));
  return batches.map((batch) => batch.id);
}

async function processBatch(batchId: string): Promise<BatchProcessResult> {
  const [batch] = await db
    .select()
    .from(documentIngestBatches)
    .where(eq(documentIngestBatches.id, batchId))
    .limit(1);
  if (!batch) {
    throw new Error("Ingest batch not found");
  }
  if (batch.status === "ready") {
    const existingPages = await db
      .select({ id: documentPages.id })
      .from(documentPages)
      .where(
        and(
          eq(documentPages.ingestRunId, batch.ingestRunId),
          gte(documentPages.pageNumber, batch.pageStart),
          lte(documentPages.pageNumber, batch.pageEnd)
        )
      );
    return { batchId, pageCount: existingPages.length };
  }
  if (!batch.tempObjectKey) {
    throw new Error("Ingest batch is missing a temporary object");
  }

  const [attachment] = await db
    .select({
      filename: reportAttachments.filename,
      gcsGeneration: reportAttachments.gcsGeneration,
      deletedAt: reportAttachments.deletedAt,
    })
    .from(reportAttachments)
    .where(eq(reportAttachments.id, batch.attachmentId))
    .limit(1);
  if (!attachment || attachment.deletedAt) {
    throw cancelledError("Attachment was deleted during ingestion");
  }

  const [run] = await db
    .select({
      sourceGeneration: attachmentIngestRuns.sourceGeneration,
      extractModelId: attachmentIngestRuns.extractModelId,
    })
    .from(attachmentIngestRuns)
    .where(eq(attachmentIngestRuns.id, batch.ingestRunId))
    .limit(1);
  if (!run || run.sourceGeneration !== attachment.gcsGeneration) {
    throw cancelledError("Attachment source changed during ingestion");
  }

  await db
    .update(documentIngestBatches)
    .set({ status: "running", error: null })
    .where(eq(documentIngestBatches.id, batchId));

  const previous = await db
    .select({
      batchSummary: documentIngestBatches.batchSummary,
      continuationNote: documentIngestBatches.continuationNote,
    })
    .from(documentIngestBatches)
    .where(
      and(
        eq(documentIngestBatches.ingestRunId, batch.ingestRunId),
        eq(documentIngestBatches.batchIndex, batch.batchIndex - 1)
      )
    )
    .limit(1);

  try {
    const pdfBuffer = await getAttachmentStorage().readObjectBuffer(
      batch.tempObjectKey
    );
    const extracted = await extractPdfBatch({
      pdfBuffer,
      pageStart: batch.pageStart,
      pageEnd: batch.pageEnd,
      filename: attachment.filename,
      modelId: run.extractModelId,
      previousBatchSummary: previous[0]?.batchSummary,
      previousContinuationNote: previous[0]?.continuationNote,
    });

    console.info(
      `[document-ingest] Extracted pages ${batch.pageStart}-${batch.pageEnd}`,
      {
        mode: extracted.mode,
        recovery: extracted.recovery,
        pageCount: extracted.pages.length,
        usage: extracted.usage,
      }
    );

    await db.transaction(async (tx) => {
      await tx
        .delete(documentPages)
        .where(
          and(
            eq(documentPages.ingestRunId, batch.ingestRunId),
            gte(documentPages.pageNumber, batch.pageStart),
            lte(documentPages.pageNumber, batch.pageEnd)
          )
        );
      if (extracted.pages.length > 0) {
        await tx.insert(documentPages).values(
          extracted.pages.map((page) => ({
            ingestRunId: batch.ingestRunId,
            attachmentId: batch.attachmentId,
            reportId: batch.reportId,
            pageNumber: page.pageNumber,
            printedPageLabel: page.printedPageLabel,
            transcript: page.transcript,
            visualInterpretation: page.visualInterpretation,
            pageContext: page.pageContext,
            confidence: page.confidence,
          }))
        );
      }
      await tx
        .update(documentIngestBatches)
        .set({
          status: "ready",
          error: null,
          batchSummary: extracted.batchSummary,
          continuationNote: extracted.continuationNote,
          completedAt: new Date(),
        })
        .where(eq(documentIngestBatches.id, batchId));
    });

    return { batchId, pageCount: extracted.pages.length };
  } catch (error) {
    const message = sanitizeIngestError(error);
    await db
      .update(documentIngestBatches)
      .set({ status: "failed", error: message })
      .where(eq(documentIngestBatches.id, batchId));
    throw error;
  }
}

async function updateBatchProgress(
  runId: string,
  attachmentId: string
): Promise<{ completedBatchCount: number; progress: number }> {
  const [counts] = await db
    .select({
      batchCount: attachmentIngestRuns.batchCount,
      completedBatchCount: sql<number>`count(${documentIngestBatches.id})::int`,
    })
    .from(attachmentIngestRuns)
    .leftJoin(
      documentIngestBatches,
      and(
        eq(documentIngestBatches.ingestRunId, attachmentIngestRuns.id),
        eq(documentIngestBatches.status, "ready")
      )
    )
    .where(eq(attachmentIngestRuns.id, runId))
    .groupBy(attachmentIngestRuns.id);

  const batchCount = counts?.batchCount ?? 0;
  const completedBatchCount = counts?.completedBatchCount ?? 0;
  const progress =
    batchCount > 0
      ? Math.min(80, 10 + Math.round((completedBatchCount / batchCount) * 60))
      : 10;

  await db.transaction(async (tx) => {
    await tx
      .update(attachmentIngestRuns)
      .set({ completedBatchCount })
      .where(eq(attachmentIngestRuns.id, runId));
    await tx
      .update(reportAttachments)
      .set({ processingProgress: progress })
      .where(eq(reportAttachments.id, attachmentId));
  });

  return { completedBatchCount, progress };
}

async function buildDocumentSummary(runId: string): Promise<{ batchCount: number }> {
  const batches = await db
    .select({
      batchIndex: documentIngestBatches.batchIndex,
      batchSummary: documentIngestBatches.batchSummary,
    })
    .from(documentIngestBatches)
    .where(eq(documentIngestBatches.ingestRunId, runId))
    .orderBy(asc(documentIngestBatches.batchIndex));
  const documentSummary = batches
    .map((batch) => batch.batchSummary?.trim())
    .filter((summary): summary is string => Boolean(summary))
    .join("\n\n")
    .slice(0, SUMMARY_MAX_CHARS);

  await db
    .update(attachmentIngestRuns)
    .set({ documentSummary })
    .where(eq(attachmentIngestRuns.id, runId));
  return { batchCount: batches.length };
}

async function chunkAndEmbedRun(input: IngestInit): Promise<{ chunkCount: number }> {
  const pages = await db
    .select({
      id: documentPages.id,
      pageNumber: documentPages.pageNumber,
      transcript: documentPages.transcript,
      visualInterpretation: documentPages.visualInterpretation,
      pageContext: documentPages.pageContext,
    })
    .from(documentPages)
    .where(eq(documentPages.ingestRunId, input.runId))
    .orderBy(asc(documentPages.pageNumber));

  const chunks = chunkDocumentPages({
    filename: input.filename,
    pages,
  });
  await db.delete(documentChunks).where(eq(documentChunks.ingestRunId, input.runId));
  if (chunks.length === 0) {
    await db
      .update(reportAttachments)
      .set({ processingProgress: 90 })
      .where(eq(reportAttachments.id, input.attachmentId));
    return { chunkCount: 0 };
  }

  const embeddings = await embedDocumentChunks({
    texts: chunks.map((chunk) => chunk.contextualText),
    modelId: input.embeddingModelId,
  });

  await db.insert(documentChunks).values(
    chunks.map((chunk, index) => ({
      ingestRunId: input.runId,
      attachmentId: input.attachmentId,
      reportId: input.reportId,
      pageId: chunk.pageId,
      pageNumber: chunk.pageNumber,
      ordinal: chunk.ordinal,
      rawText: chunk.rawText,
      contextualText: chunk.contextualText,
      sourceKind: chunk.sourceKind,
      embedding: embeddings[index],
    }))
  );
  await db
    .update(reportAttachments)
    .set({ processingProgress: 90 })
    .where(eq(reportAttachments.id, input.attachmentId));

  return { chunkCount: chunks.length };
}

async function markRunReady(input: IngestInit): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(attachmentIngestRuns)
      .set({
        status: "superseded",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(attachmentIngestRuns.attachmentId, input.attachmentId),
          eq(attachmentIngestRuns.status, "ready"),
          ne(attachmentIngestRuns.id, input.runId)
        )
      );
    await tx
      .update(attachmentIngestRuns)
      .set({
        status: "ready",
        completedAt: new Date(),
      })
      .where(eq(attachmentIngestRuns.id, input.runId));
    await tx
      .update(reportAttachments)
      .set({
        activeIngestRunId: input.runId,
        processingStatus: "ready",
        processingProgress: 100,
        processingError: null,
      })
      .where(eq(reportAttachments.id, input.attachmentId));
  });
}

async function markRunTerminal(input: {
  runId: string | null;
  attachmentId: string;
  generation: string;
  status: AttachmentIngestRunStatus;
  message: string;
}): Promise<void> {
  const completedAt = new Date();
  await db.transaction(async (tx) => {
    if (input.runId) {
      await tx
        .update(attachmentIngestRuns)
        .set({
          status: input.status,
          error: input.message,
          completedAt,
        })
        .where(eq(attachmentIngestRuns.id, input.runId));
    }

    const [attachment] = await tx
      .select({
        deletedAt: reportAttachments.deletedAt,
        gcsGeneration: reportAttachments.gcsGeneration,
      })
      .from(reportAttachments)
      .where(eq(reportAttachments.id, input.attachmentId))
      .limit(1);

    if (
      attachment &&
      !attachment.deletedAt &&
      attachment.gcsGeneration === input.generation
    ) {
      await tx
        .update(reportAttachments)
        .set({
          processingStatus: "failed",
          processingProgress: FAILED_ATTACHMENT_PROGRESS,
          processingError: input.message,
        })
        .where(eq(reportAttachments.id, input.attachmentId));
    }
  });
}

async function cleanupTempObjects(runId: string): Promise<{ deletedCount: number }> {
  const batches = await db
    .select({ tempObjectKey: documentIngestBatches.tempObjectKey })
    .from(documentIngestBatches)
    .where(eq(documentIngestBatches.ingestRunId, runId));
  const objectKeys = batches.flatMap((batch) =>
    batch.tempObjectKey ? [batch.tempObjectKey] : []
  );
  const storage = getAttachmentStorage();
  let deletedCount = 0;
  for (const objectKey of objectKeys) {
    try {
      await storage.deleteObject(objectKey);
      deletedCount += 1;
    } catch {
      // Best-effort cleanup; storage lifecycle can clean stragglers.
    }
  }
  return { deletedCount };
}

function cancelledError(message: string): Error {
  return new Error(`INGEST_CANCELLED: ${message}`);
}
