import { and, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { reportAttachments, reports } from "@/db/schema";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import {
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
      stagingObjectKey: string;
      permanentObjectKey: string;
    }
  | { ok: false; error: string; status: 400 };

/**
 * Atomically enforce per-report attachment count/byte quotas under a report
 * row lock, then insert the reservation. Prevents concurrent upload-url
 * requests from all passing the same pre-check snapshot.
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

  const attachmentId = createId();
  const stagingKey = stagingObjectKey(attachmentId);
  const permanentKey = permanentObjectKey(input.reportId, attachmentId);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select ${reports.id} from ${reports} where ${reports.id} = ${input.reportId} for update`
    );

    const activeRows = await tx
      .select({
        sizeBytes: reportAttachments.sizeBytes,
      })
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.reportId, input.reportId),
          isNull(reportAttachments.deletedAt)
        )
      );

    const activeSizeBytes = activeRows.reduce(
      (sum, row) => sum + row.sizeBytes,
      0
    );
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

    await tx.insert(reportAttachments).values({
      id: attachmentId,
      reportId: input.reportId,
      folderId: input.folderId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: "",
      stagingObjectKey: stagingKey,
      permanentObjectKey: permanentKey,
      processingStatus: "uploading",
      processingProgress: 0,
      uploadedById: input.uploadedById,
    });

    return {
      ok: true as const,
      attachmentId,
      stagingObjectKey: stagingKey,
      permanentObjectKey: permanentKey,
    };
  });
}
