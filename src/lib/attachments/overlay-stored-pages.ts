import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentAssets,
  documentPages,
  reportAttachments,
} from "@/db/schema";
import {
  DEFAULT_DOCUMENT_EXTRACT_MODEL_ID,
  overlayNumericSignsOnPdfPages,
} from "@/lib/attachments/extract-batch";
import { pageNeedsNumericSignLook } from "@/lib/attachments/numeric-signs";
import { storageSourceForAttachment } from "@/lib/attachments/resolve-attachment";
import type { ReviewPageSource } from "@/lib/ai/chat/document-review";
import type { DocumentPageRead } from "@/lib/attachments/retrieval";
import { getAttachmentStorage } from "@/lib/storage/attachments";
import {
  isTestStubChat,
  isTestStubDocumentIngest,
} from "@/lib/test/ai-bypass";

function reviewPageKey(page: {
  attachmentId: string;
  pageNumber: number;
}): string {
  return `${page.attachmentId}:${page.pageNumber}`;
}

function overlayConfigured(): boolean {
  if (isTestStubChat() || isTestStubDocumentIngest()) return false;
  return Boolean(process.env.GOOGLE_VERTEX_PROJECT?.trim());
}

/**
 * Reuse ingest's PNG signed-quantity overlay on stored pages whose
 * transcripts still look unsigned. Fail-soft: unsigned text stays if raster
 * or Gemini cannot run. Never invent a minus.
 */
export async function overlayNumericSignsOnReviewPages(input: {
  reportId: string;
  pages: ReviewPageSource[];
}): Promise<ReviewPageSource[]> {
  if (!overlayConfigured() || input.pages.length === 0) return input.pages;
  const needed = input.pages.filter((page) =>
    pageNeedsNumericSignLook(page.transcript, page.visualInterpretation ?? "")
  );
  if (needed.length === 0) return input.pages;

  const byKey = new Map(
    input.pages.map((page) => [reviewPageKey(page), page] as const)
  );
  const groups = new Map<string, ReviewPageSource[]>();
  for (const page of needed) {
    const group = groups.get(page.attachmentId) ?? [];
    group.push(page);
    groups.set(page.attachmentId, group);
  }

  for (const [attachmentId, group] of groups) {
    try {
      const updated = await overlayOneAttachment({
        reportId: input.reportId,
        attachmentId,
        pages: group,
      });
      for (const page of updated) {
        byKey.set(reviewPageKey(page), page);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[document-extract] Stored sign overlay failed", {
        reportId: input.reportId,
        attachmentId,
        error: message,
      });
    }
  }

  return input.pages.map(
    (page) => byKey.get(reviewPageKey(page)) ?? page
  );
}

export async function overlayNumericSignsOnReadPage(input: {
  reportId: string;
  page: DocumentPageRead;
}): Promise<DocumentPageRead> {
  const [overlaid] = await overlayNumericSignsOnReviewPages({
    reportId: input.reportId,
    pages: [
      {
        attachmentId: input.page.attachmentId,
        filename: input.page.filename,
        pageNumber: input.page.pageNumber,
        transcript: input.page.transcript,
        pageContext: input.page.pageContext,
        printedPageLabel: input.page.printedPageLabel,
        ingestRunId: input.page.ingestRunId,
        visualInterpretation: input.page.visualInterpretation,
      },
    ],
  });
  if (!overlaid) return input.page;
  return {
    ...input.page,
    transcript: overlaid.transcript,
    visualInterpretation: overlaid.visualInterpretation ?? "",
  };
}

async function overlayOneAttachment(input: {
  reportId: string;
  attachmentId: string;
  pages: ReviewPageSource[];
}): Promise<ReviewPageSource[]> {
  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, input.attachmentId),
        eq(reportAttachments.reportId, input.reportId)
      )
    )
    .limit(1);
  if (!attachment || attachment.deletedAt) return input.pages;

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
  if (!storageSource.mimeType.toLowerCase().includes("pdf")) {
    return input.pages;
  }
  if (!storageSource.permanentObjectKey) return input.pages;

  const pdfBuffer = await getAttachmentStorage().readObjectBuffer(
    storageSource.permanentObjectKey
  );
  const modelId =
    process.env.DOCUMENT_EXTRACT_GOOGLE_MODEL_ID?.trim() ||
    DEFAULT_DOCUMENT_EXTRACT_MODEL_ID;
  const result = await overlayNumericSignsOnPdfPages({
    pdfBuffer,
    filename: attachment.filename,
    modelId,
    pages: input.pages.map((page) => ({
      pageNumber: page.pageNumber,
      transcript: page.transcript,
      visualInterpretation: page.visualInterpretation ?? "",
    })),
  });
  if (result.overlayErrors && result.overlayErrors.length > 0) {
    console.error("[document-extract] Stored sign overlay errors", {
      attachmentId: input.attachmentId,
      overlayErrors: result.overlayErrors,
    });
  }

  const ingestRunId = attachment.activeIngestRunId;
  const byNumber = new Map(
    result.pages.map((page) => [page.pageNumber, page] as const)
  );
  const next: ReviewPageSource[] = [];
  for (const page of input.pages) {
    const overlaid = byNumber.get(page.pageNumber);
    if (!overlaid) {
      next.push(page);
      continue;
    }
    const updated: ReviewPageSource = {
      ...page,
      transcript: overlaid.transcript,
      visualInterpretation: overlaid.visualInterpretation,
    };
    next.push(updated);
    if (
      ingestRunId &&
      (overlaid.transcript !== page.transcript ||
        overlaid.visualInterpretation !== (page.visualInterpretation ?? ""))
    ) {
      await db
        .update(documentPages)
        .set({
          transcript: overlaid.transcript,
          visualInterpretation: overlaid.visualInterpretation,
        })
        .where(
          and(
            eq(documentPages.ingestRunId, ingestRunId),
            eq(documentPages.attachmentId, input.attachmentId),
            eq(documentPages.pageNumber, page.pageNumber)
          )
        );
    }
  }
  return next;
}
