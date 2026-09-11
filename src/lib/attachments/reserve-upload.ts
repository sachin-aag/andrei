import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import {
  attachmentAssets,
  reportAttachments,
  reports,
} from "@/db/schema";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import {
  assertAttachmentStorageBudgetAvailable,
  AttachmentStorageBudgetExceededError,
} from "@/lib/attachments/storage-budget";
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
  | { ok: false; error: string; status: 400 | 429 };

/**
 * Reserve a report attachment upload under a report row lock, then insert the
 * library asset and report link. Enforces per-file size and workspace storage budget.
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

    try {
      await assertAttachmentStorageBudgetAvailable(input.sizeBytes, tx);
    } catch (error) {
      if (error instanceof AttachmentStorageBudgetExceededError) {
        return {
          ok: false as const,
          error: error.message,
          status: 429 as const,
        };
      }
      throw error;
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

export type ReserveLibraryUploadInput = {
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  libraryFolderId: string | null;
};

export type ReserveLibraryUploadResult =
  | {
      ok: true;
      assetId: string;
      stagingObjectKey: string;
      permanentObjectKey: string;
    }
  | { ok: false; error: string; status: 400 | 429 };

/** Reserve a library-only asset (no report row). Enforces the workspace byte cap. */
export async function reserveLibraryUpload(
  input: ReserveLibraryUploadInput
): Promise<ReserveLibraryUploadResult> {
  const limits = getAttachmentLimits();
  if (input.sizeBytes > limits.maxAttachmentBytes) {
    return {
      ok: false,
      error: `File exceeds ${limits.maxAttachmentBytes} byte limit`,
      status: 400,
    };
  }

  const assetId = createId();
  const stagingKey = assetStagingObjectKey(assetId);
  const permanentKey = assetPermanentObjectKey(assetId);

  return db.transaction(async (tx) => {
    try {
      await assertAttachmentStorageBudgetAvailable(input.sizeBytes, tx);
    } catch (error) {
      if (error instanceof AttachmentStorageBudgetExceededError) {
        return {
          ok: false as const,
          error: error.message,
          status: 429 as const,
        };
      }
      throw error;
    }

    await tx.insert(attachmentAssets).values({
      id: assetId,
      ownerId: input.ownerId,
      libraryFolderId: input.libraryFolderId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: "",
      stagingObjectKey: stagingKey,
      permanentObjectKey: permanentKey,
      processingStatus: "uploading",
      processingProgress: 0,
    });

    return {
      ok: true as const,
      assetId,
      stagingObjectKey: stagingKey,
      permanentObjectKey: permanentKey,
    };
  });
}
