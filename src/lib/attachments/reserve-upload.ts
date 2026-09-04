import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import {
  attachmentAssets,
  reportAttachments,
  reports,
} from "@/db/schema";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import {
  assetPermanentObjectKey,
  assetStagingObjectKey,
  permanentObjectKey,
  stagingObjectKey,
} from "@/lib/storage/attachments";

export type ReserveAttachmentInput = {
  reportId: string;
  folderId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
};

export type ReserveAttachmentResult =
  | {
      ok: true;
      attachmentId: string;
      assetId: string;
      stagingObjectKey: string;
      permanentObjectKey: string;
    }
  | { ok: false; error: string; status: 400 };

/**
 * Atomically enforce per-report attachment count/byte quotas under a report
 * row lock, then insert the library asset and report link.
 */
export async function reserveAttachmentUpload(
  input: ReserveAttachmentInput
): Promise<ReserveAttachmentResult> {
  const limits = getAttachmentLimits();
  if (input.sizeBytes > limits.maxAttachmentBytes) {
    return {
      ok: false,
      error: `PDF exceeds ${limits.maxAttachmentBytes} byte limit`,
      status: 400,
    };
  }

  const assetId = createId();
  const attachmentId = createId();
  const stagingKey = assetStagingObjectKey(assetId);
  const permanentKey = assetPermanentObjectKey(assetId);
  const legacyStagingKey = stagingObjectKey(attachmentId);
  const legacyPermanentKey = permanentObjectKey(input.reportId, attachmentId);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${reports.id} from ${reports} where ${reports.id} = ${input.reportId} for update`
    );

    const activeRows = await tx
      .select({
        sizeBytes: reportAttachments.sizeBytes,
        assetId: reportAttachments.assetId,
      })
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.reportId, input.reportId),
          isNull(reportAttachments.deletedAt)
        )
      );

    const assetIds = [
      ...new Set(
        activeRows
          .map((row) => row.assetId)
          .filter((id): id is string => id != null)
      ),
    ];
    const linkedAssets =
      assetIds.length === 0
        ? []
        : await tx
            .select({
              id: attachmentAssets.id,
              sizeBytes: attachmentAssets.sizeBytes,
            })
            .from(attachmentAssets)
            .where(
              and(
                inArray(attachmentAssets.id, assetIds),
                isNull(attachmentAssets.deletedAt)
              )
            );
    const assetSizeById = new Map(
      linkedAssets.map((asset) => [asset.id, asset.sizeBytes])
    );

    const activeSizeBytes = activeRows.reduce((sum, row) => {
      if (row.assetId) {
        return sum + (assetSizeById.get(row.assetId) ?? row.sizeBytes);
      }
      return sum + row.sizeBytes;
    }, 0);

    if (activeRows.length >= limits.maxAttachmentsPerReport) {
      return {
        ok: false as const,
        error: `Report already has ${limits.maxAttachmentsPerReport} attachments`,
        status: 400 as const,
      };
    }
    if (activeSizeBytes + input.sizeBytes > limits.maxAttachmentBytesPerReport) {
      return {
        ok: false as const,
        error: "Report attachment storage limit exceeded",
        status: 400 as const,
      };
    }

    await tx.insert(attachmentAssets).values({
      id: assetId,
      ownerId: input.uploadedById,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: "",
      stagingObjectKey: stagingKey,
      permanentObjectKey: permanentKey,
      processingStatus: "uploading",
      processingProgress: 0,
    });

    await tx.insert(reportAttachments).values({
      id: attachmentId,
      reportId: input.reportId,
      assetId,
      folderId: input.folderId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: "",
      stagingObjectKey: legacyStagingKey,
      permanentObjectKey: legacyPermanentKey,
      processingStatus: "uploading",
      processingProgress: 0,
      uploadedById: input.uploadedById,
    });

    return {
      ok: true as const,
      attachmentId,
      assetId,
      stagingObjectKey: stagingKey,
      permanentObjectKey: permanentKey,
    };
  });
}
