import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import mammoth from "mammoth";
import { db } from "@/db";
import {
  attachmentAssets,
  attachmentIngestRuns,
  documentChunks,
  documentIngestBatches,
  documentOutlineSpans,
  documentPages,
  reportAttachments,
  type AttachmentIngestRunStatus,
} from "@/db/schema";
import { chunkDocumentPages } from "@/lib/attachments/chunk-pages";
import { describeDocxImages } from "@/lib/attachments/describe-docx-images";
import {
  DOCUMENT_AI_OCR_CONCURRENCY,
  documentAiIngestSplitOptions,
  isDocumentAiConfigured,
} from "@/lib/attachments/document-ai-ocr";
import {
  assignDocxImagesToPages,
  extractDocxEmbeddedImages,
  formatDocxPageVisualInterpretation,
} from "@/lib/attachments/docx-images";
import { syncAssetProcessing } from "@/lib/attachments/sync-asset-processing";
import { storageSourceForAttachment } from "@/lib/attachments/resolve-attachment";
import {
  DEFAULT_DOCUMENT_EMBEDDING_MODEL_ID,
  embedDocumentChunks,
} from "@/lib/attachments/embed-chunks";
import {
  DEFAULT_DOCUMENT_EXTRACT_MODEL_ID,
  DOCUMENT_EXTRACT_PROMPT_VERSION,
  extractionWarningForGaps,
  extractPdfBatch,
  gapExtractedPage,
  isGapExtractedPage,
  type ExtractedPage,
} from "@/lib/attachments/extract-batch";
import { type AttachmentKind, kindFromMime } from "@/lib/attachments/file-types";
import {
  INGEST_BATCH_TIMEOUT_MARKER,
  IngestNeedsContinuationError,
  isCancelledIngestError,
  isIngestNeedsContinuation,
  isRuntimeTimeoutError,
  sanitizeIngestError,
} from "@/lib/attachments/ingest-errors";
import {
  MAX_PDF_BATCH_PAGES,
  splitPdfIntoBatches,
} from "@/lib/attachments/pdf-split";
import { recordAttachmentPageUsage } from "@/lib/attachments/page-budget";
import {
  buildOutlineSpanRows,
  toDocumentPageRetrievalFields,
} from "@/lib/attachments/page-metadata";
import { getAttachmentStorage, tempBatchObjectKey } from "@/lib/storage/attachments";
import {
  flushLangfuseTraces,
  observeWork,
  setRouteObservationIO,
  withPropagatedAttributes,
} from "@/lib/observability/langfuse";

export { sanitizeIngestError } from "@/lib/attachments/ingest-errors";

const PARSER_VERSION = "v4";
const SUMMARY_MAX_CHARS = 12_000;
const FAILED_ATTACHMENT_PROGRESS = 0;
/** Yield before Vercel’s 300s isolate budget so a later slice can resume. */
const DEFAULT_INGEST_SLICE_MS = 240_000;
/** DOCX has no page model; split extracted text into readable pseudo-pages. */
const DOCX_PSEUDO_PAGE_CHARS = 6_000;

export type IngestRunOutcome = "done" | "continue";

export type RunDocumentIngestOptions = {
  resume?: boolean;
};

type IngestInit = {
  runId: string;
  attachmentId: string;
  assetId: string | null;
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
  generation: string,
  options: RunDocumentIngestOptions = {}
): Promise<IngestRunOutcome> {
  let init: IngestInit | null = null;
  let keepTempObjects = false;
  try {
    init = await initializeIngestRun(attachmentId, generation, options);
    if (!init) return "done";
    const outcome = await withPropagatedAttributes(
      {
        sessionId: init.reportId,
        traceName: "document-ingest",
        tags: ["document-ingest", init.kind],
        metadata: {
          reportId: init.reportId,
          attachmentId: init.attachmentId,
          filename: init.filename,
          kind: init.kind,
        },
      },
      () =>
        observeWork("document-ingest", async () => {
          setRouteObservationIO({
            input: {
              reportId: init!.reportId,
              attachmentId: init!.attachmentId,
              filename: init!.filename,
              kind: init!.kind,
            },
          });
          if (init!.kind === "docx") {
            await runDocxIngest(init!);
          } else {
            await runPdfIngest(init!);
          }
          setRouteObservationIO({ output: { status: "done" } });
          return "done" as const;
        })
    );
    return outcome;
  } catch (error) {
    if (isIngestNeedsContinuation(error) || isRuntimeTimeoutError(error)) {
      keepTempObjects = true;
      if (init) {
        await prepareRunForContinuation(init.runId);
      }
      return "continue";
    }
    await markRunTerminal({
      runId: init?.runId ?? null,
      attachmentId,
      generation,
      status: isCancelledIngestError(error) ? "cancelled" : "failed",
      message: sanitizeIngestError(error),
    });
    throw error;
  } finally {
    await flushLangfuseTraces();
    if (init && !keepTempObjects) {
      await cleanupTempObjects(init.runId);
    }
  }
}

async function initializeIngestRun(
  attachmentId: string,
  generation: string,
  options: RunDocumentIngestOptions
): Promise<IngestInit | null> {
  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    throw new Error("Attachment not found");
  }
  const asset = attachment.assetId
    ? (
        await db
          .select()
          .from(attachmentAssets)
          .where(eq(attachmentAssets.id, attachment.assetId))
          .limit(1)
      )[0]
    : null;
  const storageSource = storageSourceForAttachment(attachment, asset);
  if (attachment.deletedAt) {
    throw cancelledError("Attachment was deleted before ingestion started");
  }
  if (
    !storageSource.gcsGeneration ||
    storageSource.gcsGeneration !== generation
  ) {
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
      .select({
        id: attachmentIngestRuns.id,
        extractModelId: attachmentIngestRuns.extractModelId,
        embeddingModelId: attachmentIngestRuns.embeddingModelId,
      })
      .from(attachmentIngestRuns)
      .where(
        and(
          eq(attachmentIngestRuns.attachmentId, attachmentId),
          eq(attachmentIngestRuns.sourceGeneration, generation),
          inArray(attachmentIngestRuns.status, ["pending", "running"])
        )
      )
      .limit(1);
    if (existingRun) {
      if (!options.resume) return null;
      await tx
        .update(attachmentIngestRuns)
        .set({ startedAt: new Date() })
        .where(eq(attachmentIngestRuns.id, existingRun.id));
      await tx
        .update(reportAttachments)
        .set({ processingStatus: "processing" })
        .where(eq(reportAttachments.id, attachment.id));
      return {
        runId: existingRun.id,
        extractModelId: existingRun.extractModelId,
        embeddingModelId: existingRun.embeddingModelId,
      };
    }

    await tx.insert(attachmentIngestRuns).values({
      id: runId,
      attachmentId: attachment.id,
      assetId: attachment.assetId,
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
        processingPage: null,
        processingError: null,
      })
      .where(eq(reportAttachments.id, attachment.id));
    if (attachment.assetId) {
      await tx
        .update(attachmentAssets)
        .set({
          processingStatus: "processing",
          processingProgress: 0,
          processingPage: null,
          processingError: null,
        })
        .where(eq(attachmentAssets.id, attachment.assetId));
    }
    return { runId, extractModelId, embeddingModelId };
  });

  if (!started) return null;

  return {
    runId: started.runId,
    attachmentId: attachment.id,
    assetId: attachment.assetId,
    reportId: attachment.reportId,
    filename: attachment.filename,
    kind: kindFromMime(storageSource.mimeType) ?? "pdf",
    sourceObjectKey: storageSource.permanentObjectKey,
    sourceGeneration: generation,
    extractModelId: started.extractModelId,
    embeddingModelId: started.embeddingModelId,
  };
}

/** PDF path: split into batches, extract each, then chunk+embed. */
async function runPdfIngest(init: IngestInit): Promise<void> {
  await assertAttachmentCurrent(init);
  const existingBatches = await listBatches(init.runId);
  if (existingBatches.length === 0) {
    await splitAndPersistBatches(init);
  }
  const batches = await listBatches(init.runId);
  const sliceStartedAt = Date.now();

  if (usesParallelOcrBatches(batches)) {
    await processPdfBatchesInWaves(init, sliceStartedAt);
  } else {
    for (const batch of batches) {
      if (batch.status === "ready") continue;
      if (shouldYieldIngestSlice(sliceStartedAt)) {
        throw new IngestNeedsContinuationError();
      }
      await assertAttachmentCurrent(init);
      await heartbeatIngestRun(init.runId, init.attachmentId, batch.pageEnd);
      await processBatch(batch.id);
      await updateBatchProgress(init.runId, init.attachmentId);
    }
  }

  await assertAttachmentCurrent(init);
  const pages = await listRunPages(init.runId);
  if (pages.length === 0 || pages.every(isGapExtractedPage)) {
    throw new Error(
      extractionWarningForGaps(pages) ??
        "PDF extraction produced no output for this document"
    );
  }
  const warning = extractionWarningForGaps(pages);
  await buildDocumentSummary(init.runId);
  await chunkAndEmbedRun(init);
  await assertAttachmentCurrent(init);
  await markRunReady(init, warning);
}

/**
 * DOCX path: mammoth for body text, OOXML for embedded rasters (described via
 * the same Vertex extract model as PDF vision), then the shared chunk→embed
 * machinery so image descriptions are searchable like PDF visuals.
 */
async function runDocxIngest(init: IngestInit): Promise<void> {
  await assertAttachmentCurrent(init);
  const buffer = await getAttachmentStorage().readObjectBuffer(
    init.sourceObjectKey
  );
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  let pages = buildDocxPseudoPages(rawText);

  const { images, totalXmlChars } = extractDocxEmbeddedImages(buffer);
  if (pages.length === 0 && images.length > 0) {
    pages = [{ pageNumber: 1, text: "" }];
  }

  const visualByPage = new Map<number, string>();
  if (images.length > 0) {
    await db
      .update(reportAttachments)
      .set({ processingProgress: 40 })
      .where(eq(reportAttachments.id, init.attachmentId));

    const descriptions = await describeDocxImages({
      images,
      filename: init.filename,
      modelId: init.extractModelId,
    });
    const descriptionByOrdinal = new Map(
      descriptions.map((entry) => [entry.ordinal, entry.description] as const)
    );
    const imagesByPage = assignDocxImagesToPages(pages, images, totalXmlChars);
    for (const [pageNumber, pageImages] of imagesByPage) {
      visualByPage.set(
        pageNumber,
        formatDocxPageVisualInterpretation(
          pageImages.map((image) => ({
            ordinal: image.ordinal,
            description: descriptionByOrdinal.get(image.ordinal) ?? "",
          }))
        )
      );
    }
  }

  await assertAttachmentCurrent(init);
  await db.transaction(async (tx) => {
    await tx
      .delete(documentPages)
      .where(eq(documentPages.ingestRunId, init.runId));
    if (pages.length > 0) {
      await tx.insert(documentPages).values(
        pages.map((page) => ({
          ingestRunId: init.runId,
          attachmentId: init.attachmentId,
          assetId: init.assetId,
          reportId: init.reportId,
          pageNumber: page.pageNumber,
          printedPageLabel: null,
          transcript: page.text,
          visualInterpretation: visualByPage.get(page.pageNumber) ?? "",
          pageContext: init.filename,
          confidence: null,
          ...toDocumentPageRetrievalFields({ transcript: page.text }),
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
  const split = await splitPdfForIngest(sourceBuffer);

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

async function listBatches(runId: string): Promise<
  Array<{ id: string; pageStart: number; pageEnd: number; status: string }>
> {
  return db
    .select({
      id: documentIngestBatches.id,
      pageStart: documentIngestBatches.pageStart,
      pageEnd: documentIngestBatches.pageEnd,
      status: documentIngestBatches.status,
    })
    .from(documentIngestBatches)
    .where(eq(documentIngestBatches.ingestRunId, runId))
    .orderBy(asc(documentIngestBatches.batchIndex));
}

async function splitPdfForIngest(sourceBuffer: Buffer) {
  // Searchable scans and born-digital files have a text layer. They used to
  // skip this path and fall into Gemini's 3-page sequential insight loop.
  // Enterprise OCR batching is 15 pages × 3 in flight (45 pages).
  if (isDocumentAiConfigured()) {
    return splitPdfIntoBatches(sourceBuffer, documentAiIngestSplitOptions());
  }
  return splitPdfIntoBatches(sourceBuffer);
}

function usesParallelOcrBatches(
  batches: Array<{ pageStart: number; pageEnd: number }>
): boolean {
  return batches.some(
    (batch) => batch.pageEnd - batch.pageStart + 1 > MAX_PDF_BATCH_PAGES
  );
}

async function processPdfBatchesInWaves(
  init: IngestInit,
  sliceStartedAt: number
): Promise<void> {
  for (;;) {
    const batches = await listBatches(init.runId);
    const pending = batches.filter((batch) => batch.status !== "ready");
    if (pending.length === 0) return;
    if (shouldYieldIngestSlice(sliceStartedAt)) {
      throw new IngestNeedsContinuationError();
    }
    const wave = pending.slice(0, DOCUMENT_AI_OCR_CONCURRENCY);
    if (wave.length === 0) return;
    await assertAttachmentCurrent(init);
    await heartbeatIngestRun(
      init.runId,
      init.attachmentId,
      Math.max(...wave.map((batch) => batch.pageEnd))
    );
    await Promise.all(wave.map((batch) => processBatch(batch.id)));
    await updateBatchProgress(init.runId, init.attachmentId);
  }
}

function ingestSliceBudgetMs(): number {
  const raw = process.env.DOCUMENT_INGEST_SLICE_MS?.trim();
  if (!raw) return DEFAULT_INGEST_SLICE_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_INGEST_SLICE_MS;
}

function shouldYieldIngestSlice(sliceStartedAt: number): boolean {
  return Date.now() - sliceStartedAt >= ingestSliceBudgetMs();
}

async function heartbeatIngestRun(
  runId: string,
  attachmentId: string,
  processingPage: number
): Promise<void> {
  await db
    .update(attachmentIngestRuns)
    .set({ startedAt: new Date() })
    .where(eq(attachmentIngestRuns.id, runId));
  await db
    .update(reportAttachments)
    .set({ processingPage })
    .where(eq(reportAttachments.id, attachmentId));
}

async function prepareRunForContinuation(runId: string): Promise<void> {
  const running = await db
    .select()
    .from(documentIngestBatches)
    .where(
      and(
        eq(documentIngestBatches.ingestRunId, runId),
        eq(documentIngestBatches.status, "running")
      )
    );
  for (const batch of running) {
    if (batch.error === INGEST_BATCH_TIMEOUT_MARKER) {
      await persistGapPagesForBatch(batch);
      continue;
    }
    await db
      .update(documentIngestBatches)
      .set({ status: "pending", error: INGEST_BATCH_TIMEOUT_MARKER })
      .where(eq(documentIngestBatches.id, batch.id));
  }
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
      assetId: attachmentIngestRuns.assetId,
    })
    .from(attachmentIngestRuns)
    .where(eq(attachmentIngestRuns.id, batch.ingestRunId))
    .limit(1);
  if (!run || run.sourceGeneration !== attachment.gcsGeneration) {
    throw cancelledError("Attachment source changed during ingestion");
  }

  const timedOutOnce = batch.error === INGEST_BATCH_TIMEOUT_MARKER;
  await db
    .update(documentIngestBatches)
    .set({ status: "running" })
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
        const assetId = run.assetId ?? null;
        await tx.insert(documentPages).values(
          extracted.pages.map((page) => ({
            ingestRunId: batch.ingestRunId,
            attachmentId: batch.attachmentId,
            assetId,
            reportId: batch.reportId,
            pageNumber: page.pageNumber,
            printedPageLabel: page.printedPageLabel,
            transcript: page.transcript,
            visualInterpretation: page.visualInterpretation,
            pageContext: page.pageContext,
            confidence: page.confidence,
            ...toDocumentPageRetrievalFields({
              transcript: page.transcript,
              hasTable: page.hasTable,
              hasFigure: page.hasFigure,
            }),
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
    if (isIngestNeedsContinuation(error) || isRuntimeTimeoutError(error)) {
      if (timedOutOnce) {
        await persistGapPagesForBatch(batch);
        return { batchId, pageCount: batch.pageEnd - batch.pageStart + 1 };
      }
      await db
        .update(documentIngestBatches)
        .set({ status: "pending", error: INGEST_BATCH_TIMEOUT_MARKER })
        .where(eq(documentIngestBatches.id, batchId));
      throw new IngestNeedsContinuationError();
    }
    const message = sanitizeIngestError(error);
    await db
      .update(documentIngestBatches)
      .set({ status: "failed", error: message })
      .where(eq(documentIngestBatches.id, batchId));
    throw error;
  }
}

async function persistGapPagesForBatch(
  batch: typeof documentIngestBatches.$inferSelect
): Promise<void> {
  const [run] = await db
    .select({ assetId: attachmentIngestRuns.assetId })
    .from(attachmentIngestRuns)
    .where(eq(attachmentIngestRuns.id, batch.ingestRunId))
    .limit(1);
  const assetId = run?.assetId ?? null;
  const pages: ExtractedPage[] = [];
  for (let pageNumber = batch.pageStart; pageNumber <= batch.pageEnd; pageNumber += 1) {
    pages.push(gapExtractedPage(pageNumber));
  }
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
    if (pages.length > 0) {
      await tx.insert(documentPages).values(
        pages.map((page) => ({
          ingestRunId: batch.ingestRunId,
          attachmentId: batch.attachmentId,
          assetId,
          reportId: batch.reportId,
          pageNumber: page.pageNumber,
          printedPageLabel: page.printedPageLabel,
          transcript: page.transcript,
          visualInterpretation: page.visualInterpretation,
          pageContext: page.pageContext,
          confidence: page.confidence,
          ...toDocumentPageRetrievalFields({
            transcript: page.transcript,
            hasTable: page.hasTable,
            hasFigure: page.hasFigure,
          }),
        }))
      );
    }
    await tx
      .update(documentIngestBatches)
      .set({
        status: "ready",
        error: extractionWarningForGaps(pages),
        batchSummary: `Pages ${batch.pageStart}-${batch.pageEnd} could not be fully indexed.`,
        continuationNote: "",
        completedAt: new Date(),
      })
      .where(eq(documentIngestBatches.id, batch.id));
  });
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

async function persistOutlineSpansForRun(input: IngestInit): Promise<void> {
  const pages = await db
    .select({
      pageNumber: documentPages.pageNumber,
      printedPageLabel: documentPages.printedPageLabel,
      pageContext: documentPages.pageContext,
      transcript: documentPages.transcript,
      identifiers: documentPages.identifiers,
    })
    .from(documentPages)
    .where(eq(documentPages.ingestRunId, input.runId))
    .orderBy(asc(documentPages.pageNumber));

  const rows = buildOutlineSpanRows(pages);
  await db
    .delete(documentOutlineSpans)
    .where(eq(documentOutlineSpans.ingestRunId, input.runId));
  if (rows.length === 0) return;

  await db.insert(documentOutlineSpans).values(
    rows.map((row) => ({
      ingestRunId: input.runId,
      attachmentId: input.attachmentId,
      reportId: input.reportId,
      ordinal: row.ordinal,
      title: row.title,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      identifiers: row.identifiers,
    }))
  );
}

async function chunkAndEmbedRun(input: IngestInit): Promise<{ chunkCount: number }> {
  await persistOutlineSpansForRun(input);
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
      assetId: input.assetId,
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

async function listRunPages(runId: string): Promise<
  Array<{ pageNumber: number; confidence: number | null; transcript: string }>
> {
  return db
    .select({
      pageNumber: documentPages.pageNumber,
      confidence: documentPages.confidence,
      transcript: documentPages.transcript,
    })
    .from(documentPages)
    .where(eq(documentPages.ingestRunId, runId))
    .orderBy(asc(documentPages.pageNumber));
}

async function markRunReady(
  input: IngestInit,
  warning: string | null = null
): Promise<void> {
  const [run] = await db
    .select({
      pageCount: attachmentIngestRuns.pageCount,
    })
    .from(attachmentIngestRuns)
    .where(eq(attachmentIngestRuns.id, input.runId))
    .limit(1);

  const [attachment] = await db
    .select({
      pageCount: reportAttachments.pageCount,
    })
    .from(reportAttachments)
    .where(eq(reportAttachments.id, input.attachmentId))
    .limit(1);

  const processedPageCount = Math.max(
    1,
    run?.pageCount ?? attachment?.pageCount ?? 1
  );

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
        processingPage: null,
        processingError: warning,
      })
      .where(eq(reportAttachments.id, input.attachmentId));
  });

  const [linked] = await db
    .select({ assetId: reportAttachments.assetId })
    .from(reportAttachments)
    .where(eq(reportAttachments.id, input.attachmentId))
    .limit(1);
  if (linked?.assetId) {
    await syncAssetProcessing(linked.assetId, {
      activeIngestRunId: input.runId,
      processingStatus: "ready",
      processingProgress: 100,
      processingPage: null,
      processingError: warning,
    });
  }

  await recordAttachmentPageUsage({
    ingestRunId: input.runId,
    attachmentId: input.attachmentId,
    reportId: input.reportId,
    pageCount: processedPageCount,
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
          processingPage: null,
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

export async function failIngestIfStillRunning(
  attachmentId: string,
  error: unknown
): Promise<void> {
  const [row] = await db
    .select({
      processingStatus: reportAttachments.processingStatus,
      processingError: reportAttachments.processingError,
      gcsGeneration: reportAttachments.gcsGeneration,
    })
    .from(reportAttachments)
    .where(eq(reportAttachments.id, attachmentId))
    .limit(1);
  if (!row || row.processingStatus === "ready") return;
  if (row.processingStatus === "failed" && row.processingError) return;

  await db
    .update(reportAttachments)
    .set({
      processingStatus: "failed",
      processingProgress: FAILED_ATTACHMENT_PROGRESS,
      processingPage: null,
      processingError: sanitizeIngestError(error),
    })
    .where(eq(reportAttachments.id, attachmentId));
}
