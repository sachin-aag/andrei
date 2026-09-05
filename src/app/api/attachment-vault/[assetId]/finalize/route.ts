import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachmentAssets } from "@/db/schema";
import { toLibraryAssetDto } from "@/lib/attachments/library-dto";
import {
  sanitizeFinalizeError,
  validateAndPromoteStagedAttachment,
} from "@/lib/attachments/finalize-staged-bytes";
import {
  canManageAttachmentAsset,
} from "@/lib/attachments/library-access";
import {
  AttachmentPageBudgetExceededError,
  attachmentPageBudgetExceededResponse,
} from "@/lib/attachments/page-budget";
import { startVaultAssetIngest } from "@/lib/attachments/start-vault-ingest";
import { syncAssetProcessing } from "@/lib/attachments/sync-asset-processing";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;

const FINALIZE_CLAIM_STATUSES = ["uploading", "failed"] as const;
const IN_FLIGHT_STATUSES = ["validating", "queued", "processing"] as const;

const bodySchema = z.object({
  generation: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assetId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const requestedGeneration = parsed.success ? parsed.data.generation : undefined;

  const [asset] = await db
    .select()
    .from(attachmentAssets)
    .where(and(eq(attachmentAssets.id, assetId), isNull(attachmentAssets.deletedAt)));
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!canManageAttachmentAsset(user, asset)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    asset.processingStatus === "ready" &&
    asset.activeIngestRunId &&
    asset.gcsGeneration &&
    (!requestedGeneration || requestedGeneration === asset.gcsGeneration)
  ) {
    return NextResponse.json({ asset: toLibraryAssetDto(asset, "mine") });
  }
  if (
    IN_FLIGHT_STATUSES.includes(
      asset.processingStatus as (typeof IN_FLIGHT_STATUSES)[number]
    )
  ) {
    return NextResponse.json({ asset: toLibraryAssetDto(asset, "mine") });
  }

  const [claimed] = await db
    .update(attachmentAssets)
    .set({
      processingStatus: "validating",
      processingProgress: 10,
      processingError: null,
    })
    .where(
      and(
        eq(attachmentAssets.id, assetId),
        inArray(attachmentAssets.processingStatus, [...FINALIZE_CLAIM_STATUSES])
      )
    )
    .returning();
  if (!claimed) {
    const [current] = await db
      .select()
      .from(attachmentAssets)
      .where(eq(attachmentAssets.id, assetId));
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ asset: toLibraryAssetDto(current, "mine") });
  }

  try {
    const promoted = await validateAndPromoteStagedAttachment({
      stagingObjectKey: claimed.stagingObjectKey,
      permanentObjectKey: claimed.permanentObjectKey,
      reservedSizeBytes: claimed.sizeBytes,
      mimeType: claimed.mimeType,
      filename: claimed.filename,
    });

    await syncAssetProcessing(claimed.id, {
      processingStatus: "queued",
      processingProgress: 0,
      processingPage: null,
      processingError: null,
      sha256: promoted.sha256,
      pageCount: promoted.pageCount,
      gcsGeneration: promoted.generation,
      crc32c: promoted.crc32c,
      sizeBytes: promoted.sizeBytes,
    });

    const [updated] = await db
      .select()
      .from(attachmentAssets)
      .where(eq(attachmentAssets.id, assetId));
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      await startVaultAssetIngest(assetId, promoted.generation);
    } catch (error) {
      if (error instanceof AttachmentPageBudgetExceededError) {
        await syncAssetProcessing(assetId, {
          processingStatus: "failed",
          processingProgress: 0,
          processingError: error.message,
        });
        return attachmentPageBudgetExceededResponse(error);
      }
      throw error;
    }

    const [afterIngest] = await db
      .select()
      .from(attachmentAssets)
      .where(eq(attachmentAssets.id, assetId));
    if (!afterIngest) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await recordAuditEvent({
      actor: auditActorFromUser(user),
      action: "attachment_uploaded",
      entityType: "attachment",
      entityId: assetId,
      summary: `Vault attachment uploaded: ${claimed.filename}`,
      newValue: {
        filename: claimed.filename,
        sizeBytes: promoted.sizeBytes,
        pageCount: promoted.pageCount,
        sha256: promoted.sha256,
        generation: promoted.generation,
      },
    });

    return NextResponse.json({ asset: toLibraryAssetDto(afterIngest, "mine") });
  } catch (error) {
    const message = sanitizeFinalizeError(error);
    await syncAssetProcessing(assetId, {
      processingStatus: "failed",
      processingProgress: 0,
      processingError: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
