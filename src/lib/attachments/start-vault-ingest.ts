import { and, eq, inArray, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import {
  attachmentAssets,
  attachmentIngestRuns,
  reportAttachments,
} from "@/db/schema";
import { validateAndPromoteStagedAttachment } from "@/lib/attachments/finalize-staged-bytes";
import {
  linkedVaultDtoNeedsIngest,
  resolveVaultIngestHolderLink,
} from "@/lib/attachments/library-link-ingest";
import { startDocumentIngest } from "@/lib/attachments/start-ingest";
import { failStaleOpenIngestRunsForAsset } from "@/lib/attachments/stale-ingest";
import { syncAssetProcessing } from "@/lib/attachments/sync-asset-processing";
import { isPostgresUniqueViolation } from "@/lib/reports/document-no";
import { ensureVaultIngestHolderReport } from "@/lib/reports/ensure-vault-ingest-holder";
import {
  getAttachmentStorage,
  permanentObjectKey,
  stagingObjectKey,
} from "@/lib/storage/attachments";

type VaultAssetRow = typeof attachmentAssets.$inferSelect;

const OPEN_INGEST_RUN_STATUSES = ["pending", "running"] as const;

export const VAULT_ASSET_NO_SOURCE_ERROR =
  "Attachment has no finalized source document";

async function ensureVaultIngestAttachment(
  asset: VaultAssetRow,
  holderReportId: string
): Promise<string> {
  const [existing] = await db
    .select({
      id: reportAttachments.id,
      deletedAt: reportAttachments.deletedAt,
    })
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.reportId, holderReportId),
        eq(reportAttachments.assetId, asset.id)
      )
    )
    .limit(1);

  const decision = resolveVaultIngestHolderLink(existing);
  if (decision.action === "use") return decision.id;

  if (decision.action === "restore") {
    await db
      .update(reportAttachments)
      .set({
        deletedAt: null,
        deletedById: null,
        filename: asset.filename,
        description: asset.description,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        sha256: asset.sha256,
        pageCount: asset.pageCount,
        processingStatus: "queued",
        processingProgress: 0,
        processingPage: null,
        processingError: null,
        gcsGeneration: asset.gcsGeneration,
        crc32c: asset.crc32c,
      })
      .where(eq(reportAttachments.id, decision.id));
    return decision.id;
  }

  const attachmentId = createId();
  try {
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
  } catch (error) {
    if (!isPostgresUniqueViolation(error)) throw error;
    const [row] = await db
      .select({ id: reportAttachments.id })
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.reportId, holderReportId),
          eq(reportAttachments.assetId, asset.id)
        )
      )
      .limit(1);
    if (!row) throw error;
    return row.id;
  }
}

function vaultIngestAlreadyComplete(
  asset: VaultAssetRow,
  generation: string
): boolean {
  return (
    asset.processingStatus === "ready" &&
    Boolean(asset.activeIngestRunId) &&
    asset.gcsGeneration === generation
  );
}

async function assetHasOpenIngestRun(assetId: string): Promise<boolean> {
  const [open] = await db
    .select({ id: attachmentIngestRuns.id })
    .from(attachmentIngestRuns)
    .where(
      and(
        eq(attachmentIngestRuns.assetId, assetId),
        inArray(attachmentIngestRuns.status, [...OPEN_INGEST_RUN_STATUSES])
      )
    )
    .limit(1);
  return Boolean(open);
}

/**
 * Old vault rows may be preview-ready (or leftover uploading) without a
 * stored generation. Prefer the permanent object; otherwise promote staging.
 */
export async function ensureVaultAssetGeneration(
  asset: VaultAssetRow
): Promise<string | null> {
  if (asset.gcsGeneration) return asset.gcsGeneration;

  const storage = getAttachmentStorage();
  try {
    const meta = await storage.getObjectMetadata(asset.permanentObjectKey);
    await syncAssetProcessing(asset.id, {
      gcsGeneration: meta.generation,
      crc32c: meta.crc32c,
      sizeBytes: meta.sizeBytes,
    });
    return meta.generation;
  } catch {
    // Permanent object is missing — try leftover staging bytes next.
  }

  try {
    const promoted = await validateAndPromoteStagedAttachment({
      stagingObjectKey: asset.stagingObjectKey,
      permanentObjectKey: asset.permanentObjectKey,
      reservedSizeBytes: asset.sizeBytes,
      mimeType: asset.mimeType,
      filename: asset.filename,
    });
    await syncAssetProcessing(asset.id, {
      sha256: promoted.sha256,
      pageCount: promoted.pageCount,
      gcsGeneration: promoted.generation,
      crc32c: promoted.crc32c,
      sizeBytes: promoted.sizeBytes,
    });
    return promoted.generation;
  } catch {
    return null;
  }
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
  if (vaultIngestAlreadyComplete(asset, generation)) {
    return;
  }

  const holderReportId = await ensureVaultIngestHolderReport(asset.ownerId);
  // Do not reclaim the whole holder report: leftover vault links often have
  // an old uploadedAt and no run yet, which used to fail the shared asset.
  await failStaleOpenIngestRunsForAsset(assetId);
  if (await assetHasOpenIngestRun(assetId)) {
    return;
  }

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

/**
 * Add-from-vault and report-attachment poll: index old or unprocessed
 * library files on the holder so every report link picks up the same run.
 */
export async function startIngestForLinkedVaultAsset(
  assetId: string
): Promise<void> {
  const [asset] = await db
    .select()
    .from(attachmentAssets)
    .where(and(eq(attachmentAssets.id, assetId), isNull(attachmentAssets.deletedAt)))
    .limit(1);
  if (!asset) return;
  if (
    asset.processingStatus === "ready" &&
    Boolean(asset.activeIngestRunId)
  ) {
    return;
  }

  const generation = await ensureVaultAssetGeneration(asset);
  if (!generation) {
    // A live browser upload is also `uploading` with no generation yet.
    // Do not fail it from the documents-panel poll.
    if (
      asset.processingStatus === "uploading" ||
      asset.processingStatus === "validating"
    ) {
      return;
    }
    await syncAssetProcessing(assetId, {
      processingStatus: "failed",
      processingProgress: 0,
      processingError: VAULT_ASSET_NO_SOURCE_ERROR,
    });
    return;
  }

  await startVaultAssetIngest(assetId, generation);
}

export async function startIngestForUnprocessedLinkedVaultAssets(
  attachments: {
    assetId: string | null;
    processingStatus: VaultAssetRow["processingStatus"];
    processingError?: string | null;
  }[]
): Promise<void> {
  const assetIds = [
    ...new Set(
      attachments.flatMap((row) => {
        if (!row.assetId) return [];
        if (
          !linkedVaultDtoNeedsIngest(
            row.processingStatus,
            row.processingError ?? null
          )
        ) {
          return [];
        }
        return [row.assetId];
      })
    ),
  ];
  if (assetIds.length === 0) return;

  await Promise.allSettled(
    assetIds.map(async (assetId) => {
      try {
        await startIngestForLinkedVaultAsset(assetId);
      } catch (error) {
        console.error("[vault-ingest] linked asset ingest failed", {
          assetId,
          error,
        });
      }
    })
  );
}
