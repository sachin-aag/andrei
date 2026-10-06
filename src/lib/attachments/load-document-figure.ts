import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentAssets,
  documentPages,
  reportAttachments,
} from "@/db/schema";
import {
  pickDocumentFigure,
  type ListedDocumentFigure,
} from "@/lib/ai/chat/insert-image";
import { sanitizePromptMetadata } from "@/lib/ai/chat/prompt-metadata";
import {
  extractDocxEmbeddedImages,
  listDocxInsertCandidates,
} from "@/lib/attachments/docx-images";
import { resolveAttachmentKind } from "@/lib/attachments/file-types";
import { listActiveAttachments } from "@/lib/attachments/list-active";
import { renderPdfPagePng } from "@/lib/attachments/pdf-page-image";
import { storageSourceForAttachment } from "@/lib/attachments/resolve-attachment";
import {
  listReadyDocumentsForReport,
  readDocumentPage,
} from "@/lib/attachments/retrieval";
import { resolveCitedAttachment } from "@/lib/citations/resolve-cited-attachment";
import { compressRasterToDataUrl } from "@/lib/images/compress-raster";
import { getAttachmentStorage } from "@/lib/storage/attachments";
import {
  isValidSuggestionImageSrc,
  type SuggestionImageInsert,
} from "@/lib/suggestions/image-insert";

/** Keep full-page PDF rasters readable in the narrative without dominating. */
const DOCUMENT_FIGURE_DISPLAY_WIDTH_PX = 640;
const PDF_INSERT_RENDER_SCALE = 1.5;

export type LoadDocumentFigureInput = {
  reportId: string;
  filename: string;
  page: number;
  figure?: number;
  allowedAttachmentIds?: readonly string[];
};

export type LoadDocumentFigureResult =
  | {
      ok: true;
      image: SuggestionImageInsert;
      filename: string;
      page: number;
      attachmentId: string;
    }
  | {
      ok: false;
      status: "image_not_found" | "available_figures";
      message: string;
    }
  | {
      ok: false;
      status: "attachment_out_of_scope";
      message: string;
      attachmentId: string;
    };

function safeName(filename: string): string {
  return sanitizePromptMetadata(filename, 180) || "unnamed";
}

function figureAlt(input: {
  filename: string;
  page: number;
  figure?: number;
  visualInterpretation: string;
  nearbyText: string;
  altText: string | null;
}): string {
  const named = input.altText?.trim();
  if (named) return named.slice(0, 200);
  const visual = input.visualInterpretation.replace(/\s+/g, " ").trim();
  if (visual) return visual.slice(0, 200);
  const nearby = input.nearbyText.replace(/\s+/g, " ").trim();
  if (nearby) return nearby.slice(0, 200);
  const figureLabel =
    input.figure != null ? `Figure ${input.figure} from` : "Figure from";
  return `${figureLabel} ${safeName(input.filename)} p. ${input.page}`;
}

async function toSuggestionImage(input: {
  bytes: Buffer;
  filename: string;
  page: number;
  figure?: number;
  visualInterpretation: string;
  nearbyText: string;
  altText: string | null;
}): Promise<SuggestionImageInsert | null> {
  const compressed = await compressRasterToDataUrl(input.bytes);
  if (!compressed || !isValidSuggestionImageSrc(compressed.dataUrl)) {
    return null;
  }
  return {
    src: compressed.dataUrl,
    alt: figureAlt(input),
    width: Math.min(compressed.width, DOCUMENT_FIGURE_DISPLAY_WIDTH_PX),
    mediaId: null,
  };
}

export async function loadDocumentFigure(
  input: LoadDocumentFigureInput
): Promise<LoadDocumentFigureResult> {
  const filename = input.filename.trim();
  if (!filename) {
    return {
      ok: false,
      status: "image_not_found",
      message:
        "Provide image.filename from list_attachments or search_documents, plus image.page.",
    };
  }

  const ready = await listReadyDocumentsForReport(input.reportId);
  const resolved = resolveCitedAttachment(
    ready.map((doc) => ({
      id: doc.attachmentId,
      filename: doc.filename,
    })),
    filename
  );

  if (resolved.status === "ambiguous") {
    return {
      ok: false,
      status: "image_not_found",
      message: `Several files match '${safeName(
        filename
      )}'. Use the exact filename from list_attachments.`,
    };
  }

  if (resolved.status === "missing") {
    const active = await listActiveAttachments(input.reportId);
    const notReady = resolveCitedAttachment(
      active.map((row) => ({ id: row.id, filename: row.filename })),
      filename
    );
    if (notReady.status === "found") {
      const row = active.find((item) => item.id === notReady.attachment.id);
      const status = row?.processingStatus;
      if (status && status !== "ready" && status !== "failed") {
        return {
          ok: false,
          status: "image_not_found",
          message: `'${safeName(
            notReady.attachment.filename
          )}' is still ingesting. Wait until it is ready, then retry insert_image.`,
        };
      }
      if (status === "failed") {
        return {
          ok: false,
          status: "image_not_found",
          message: `'${safeName(
            notReady.attachment.filename
          )}' failed ingest, so its figures cannot be copied.`,
        };
      }
    }
    return {
      ok: false,
      status: "image_not_found",
      message: `No ready attachment named '${safeName(
        filename
      )}'. Call list_attachments or search_documents first.`,
    };
  }

  if (
    input.allowedAttachmentIds &&
    input.allowedAttachmentIds.length > 0 &&
    !input.allowedAttachmentIds.includes(resolved.attachment.id)
  ) {
    return {
      ok: false,
      status: "attachment_out_of_scope",
      attachmentId: resolved.attachment.id,
      message:
        "That attachment is outside this turn's @-tagged document scope. Use one of the tagged files.",
    };
  }

  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, resolved.attachment.id),
        eq(reportAttachments.reportId, input.reportId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .limit(1);
  if (!attachment) {
    return {
      ok: false,
      status: "image_not_found",
      message: `No ready attachment named '${safeName(filename)}'.`,
    };
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
  const kind = resolveAttachmentKind({
    filename: attachment.filename,
    mimeType: storageSource.mimeType,
  });
  const displayName = safeName(attachment.filename);

  if (kind !== "pdf" && kind !== "docx") {
    return {
      ok: false,
      status: "image_not_found",
      message: `'${displayName}' is not a PDF or Word file, so its pages cannot be copied as figures.`,
    };
  }

  const storedPage = await readDocumentPage({
    reportId: input.reportId,
    attachmentId: attachment.id,
    pageNumber: input.page,
  });
  if (!storedPage) {
    const pageCount =
      ready.find((doc) => doc.attachmentId === attachment.id)?.pageCount ??
      attachment.pageCount;
    return {
      ok: false,
      status: "image_not_found",
      message:
        pageCount && pageCount > 0
          ? `'${displayName}' has ${pageCount} page${
              pageCount === 1 ? "" : "s"
            } (1–${pageCount}).`
          : `No page ${input.page} in '${displayName}'.`,
    };
  }

  if (!storageSource.permanentObjectKey) {
    return {
      ok: false,
      status: "image_not_found",
      message: `Could not read '${displayName}' from storage.`,
    };
  }

  let buffer: Buffer;
  try {
    buffer = await getAttachmentStorage().readObjectBuffer(
      storageSource.permanentObjectKey
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[insert_image] Failed to read attachment bytes", {
      attachmentId: attachment.id,
      error: message,
    });
    return {
      ok: false,
      status: "image_not_found",
      message: `Could not read '${displayName}' from storage.`,
    };
  }

  if (kind === "pdf") {
    let png: Buffer;
    try {
      png = await renderPdfPagePng(buffer, input.page, PDF_INSERT_RENDER_SCALE);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[insert_image] PDF page raster failed", {
        attachmentId: attachment.id,
        page: input.page,
        error: message,
      });
      return {
        ok: false,
        status: "image_not_found",
        message: `Could not raster page ${input.page} of '${displayName}'.`,
      };
    }
    const image = await toSuggestionImage({
      bytes: png,
      filename: displayName,
      page: input.page,
      visualInterpretation: storedPage.visualInterpretation,
      nearbyText: storedPage.transcript,
      altText: null,
    });
    if (!image) {
      return {
        ok: false,
        status: "image_not_found",
        message: `Page ${input.page} of '${displayName}' could not be compressed into a figure.`,
      };
    }
    return {
      ok: true,
      image,
      filename: displayName,
      page: input.page,
      attachmentId: attachment.id,
    };
  }

  const pages = await db
    .select({
      pageNumber: documentPages.pageNumber,
      text: documentPages.transcript,
    })
    .from(documentPages)
    .where(
      and(
        eq(documentPages.ingestRunId, storedPage.ingestRunId),
        eq(documentPages.attachmentId, attachment.id)
      )
    )
    .orderBy(asc(documentPages.pageNumber));
  const mammothPages =
    pages.length > 0
      ? pages
      : [{ pageNumber: storedPage.pageNumber, text: storedPage.transcript }];

  const { images, totalXmlChars } = extractDocxEmbeddedImages(buffer);
  const extracted = listDocxInsertCandidates(
    mammothPages,
    images,
    totalXmlChars
  );
  const listed: ListedDocumentFigure[] = extracted.map((item) => ({
    figure: item.figure,
    page: item.page,
    nearbyText: item.nearbyText,
    altText: item.altText,
    letterhead: item.letterhead,
  }));
  const picked = pickDocumentFigure({
    filename: displayName,
    page: input.page,
    figure: input.figure,
    candidates: listed,
  });
  if (!picked.ok) {
    const insertable = listed.filter(
      (item) => item.page === input.page && !item.letterhead
    );
    return {
      ok: false,
      status: insertable.length > 1 ? "available_figures" : "image_not_found",
      message: picked.message,
    };
  }

  const chosen = extracted.find((item) => item.figure === picked.figure);
  if (!chosen) {
    return {
      ok: false,
      status: "image_not_found",
      message: `No Figure ${picked.figure} in '${displayName}'.`,
    };
  }

  const image = await toSuggestionImage({
    bytes: chosen.bytes,
    filename: displayName,
    page: input.page,
    figure: chosen.figure,
    visualInterpretation: storedPage.visualInterpretation,
    nearbyText: chosen.nearbyText,
    altText: chosen.altText,
  });
  if (!image) {
    return {
      ok: false,
      status: "image_not_found",
      message: `Figure ${chosen.figure} on page ${input.page} of '${displayName}' could not be compressed into a figure.`,
    };
  }
  return {
    ok: true,
    image,
    filename: displayName,
    page: input.page,
    attachmentId: attachment.id,
  };
}
