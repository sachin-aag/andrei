import { and, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { attachmentAssets, reportAttachments } from "@/db/schema";
import { ensureVaultIngestHolderReport } from "@/lib/reports/ensure-vault-ingest-holder";
import { startDocumentIngest } from "@/lib/attachments/start-ingest";
import { syncAssetProcessing } from "@/lib/attachments/sync-asset-processing";
import {
  permanentObjectKey,
  stagingObjectKey,
} from "@/lib/storage/attachments";

type VaultAssetRow = typeof attachmentAssets.$inferSelect;

async function ensureVaultIngestAttachment(
  asset: VaultAssetRow,
  holderReportId: string
): Promise<string> {
  const [existing] = await db
    .select({ id: reportAttachments.id })
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, holderReportId),
        eq(reportAttachments.assetId, asset.id),
        isNull(reportAttachments.deletedAt)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const attachmentId = createId();
  await db.insert(reportAttachments).values({
    id: attachmentId,
    reportId: holderReportId,
    assetId: asset.id,
    folderId: null,
    filename: asset.filename,
    description: asset.description,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
    stagingObjectKey: stagingObjectKey(attachmentId),
    permanentObjectKey: permanentObjectKey(holderReportId, attachmentId),
    pageCount: asset.pageCount,
    processingStatus: "queued",
    processingProgress: 0,
    uploadedById: asset.ownerId,
    gcsGeneration: asset.gcsGeneration,
    crc32c: asset.crc32c,
  });
  return attachmentId;
}

/**
 * Queue Vertex extract/embed for a vault asset right after upload finalize.
 * Uses a hidden per-user holder report attachment so ingest can reuse the
 * existing report-scoped pipeline; linking to real reports copies
 * activeIngestRunId and is instant.
 */
export async function startVaultAssetIngest(
  assetId: string,
  generation: string
): Promise<void> {
  const [asset] = await db
    .select()
    .from(attachmentAssets)
    .where(and(eq(attachmentAssets.id, assetId), isNull(attachmentAssets.deletedAt)))
    .limit(1);
  if (!asset) {
    throw new Error("Vault asset not found");
  }
  if (asset.activeIngestRunId && asset.gcsGeneration === generation) {
    return;
  }

  const holderReportId = await ensureVaultIngestHolderReport(asset.ownerId);
  const attachmentId = await ensureVaultIngestAttachment(asset, holderReportId);

  await syncAssetProcessing(assetId, {
    processingStatus: "queued",
    processingProgress: 0,
    processingPage: null,
    processingError: null,
    gcsGeneration: generation,
  });

  await db
    .update(reportAttachments)
    .set({
      processingStatus: "queued",
      processingProgress: 0,
      processingPage: null,
      processingError: null,
      gcsGeneration: generation,
    })
    .where(eq(reportAttachments.id, attachmentId));

  await startDocumentIngest(attachmentId, generation);
}
