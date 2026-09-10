import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  attachmentAssets,
  reportAttachments,
  type AttachmentProcessingStatus,
} from "@/db/schema";
import {
  resolveAttachmentFields,
  type ResolvedAttachmentFields,
} from "@/lib/attachments/resolve-attachment";

type ProcessingPatch = {
  processingStatus?: AttachmentProcessingStatus;
  processingProgress?: number;
  processingPage?: number | null;
  processingError?: string | null;
  pageCount?: number | null;
  sha256?: string;
  gcsGeneration?: string | null;
  crc32c?: string | null;
  sizeBytes?: number;
  activeIngestRunId?: string | null;
};

export async function syncAssetProcessing(
  assetId: string,
  patch: ProcessingPatch
): Promise<void> {
  await db
    .update(attachmentAssets)
    .set(patch)
    .where(eq(attachmentAssets.id, assetId));

  await db
    .update(reportAttachments)
    .set(patch)
    .where(eq(reportAttachments.assetId, assetId));
}

export async function loadAssetForAttachment(
  attachment: Pick<typeof reportAttachments.$inferSelect, "assetId">
) {
  if (!attachment.assetId) return null;
  const [asset] = await db
    .select()
    .from(attachmentAssets)
    .where(eq(attachmentAssets.id, attachment.assetId))
    .limit(1);
  return asset ?? null;
}

export async function loadResolvedReportAttachment(
  reportId: string,
  attachmentId: string
): Promise<{
  row: typeof reportAttachments.$inferSelect;
  resolved: ResolvedAttachmentFields;
} | null> {
  const [row] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .limit(1);
  if (!row) return null;

  const asset = await loadAssetForAttachment(row);
  return { row, resolved: resolveAttachmentFields(row, asset) };
}
