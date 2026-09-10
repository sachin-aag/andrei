import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachmentAssets, reportAttachments } from "@/db/schema";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { kindFromMime } from "@/lib/attachments/file-types";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import { getMalwareScanner } from "@/lib/attachments/malware-scan";
import {
  loadAssetForAttachment,
  syncAssetProcessing,
} from "@/lib/attachments/sync-asset-processing";
import { storageSourceForAttachment } from "@/lib/attachments/resolve-attachment";
import { startDocumentIngest } from "@/lib/attachments/start-ingest";
import {
  AttachmentPageBudgetExceededError,
  attachmentPageBudgetExceededResponse,
} from "@/lib/attachments/page-budget";
import { validateDocx } from "@/lib/attachments/validate-docx";
import { validatePdf } from "@/lib/attachments/validate-pdf";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { getAttachmentStorage } from "@/lib/storage/attachments";

export const runtime = "nodejs";
/** Inline ingest (preview) can run Vertex extract+embed after the response. */
export const maxDuration = 300;

const SIZE_TOLERANCE_BYTES = 1024;

const FINALIZE_CLAIM_STATUSES = ["uploading", "failed"] as const;
const IN_FLIGHT_STATUSES = ["validating", "queued", "processing"] as const;

const bodySchema = z.object({
  generation: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, attachmentId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canMutateAttachments) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const requestedGeneration = parsed.success ? parsed.data.generation : undefined;

  const [attachment] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    );
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const asset = await loadAssetForAttachment(attachment);
  const storageSource = storageSourceForAttachment(attachment, asset);
  const resolvedStatus = asset?.processingStatus ?? attachment.processingStatus;
  const resolvedGeneration = asset?.gcsGeneration ?? attachment.gcsGeneration;

  if (
    resolvedStatus === "ready" &&
    resolvedGeneration &&
    (!requestedGeneration || requestedGeneration === resolvedGeneration)
  ) {
    return NextResponse.json({ attachment: toAttachmentDto(attachment, asset) });
  }
  if (
    IN_FLIGHT_STATUSES.includes(
      resolvedStatus as (typeof IN_FLIGHT_STATUSES)[number]
    )
  ) {
    return NextResponse.json({ attachment: toAttachmentDto(attachment, asset) });
  }

  if (asset) {
    const [claimedAsset] = await db
      .update(attachmentAssets)
      .set({
        processingStatus: "validating",
        processingProgress: 10,
        processingError: null,
      })
      .where(
        and(
          eq(attachmentAssets.id, asset.id),
          inArray(attachmentAssets.processingStatus, [...FINALIZE_CLAIM_STATUSES])
        )
      )
      .returning();
    if (!claimedAsset) {
      const [currentAsset] = await db
        .select()
        .from(attachmentAssets)
        .where(eq(attachmentAssets.id, asset.id));
      const [current] = await db
        .select()
        .from(reportAttachments)
        .where(eq(reportAttachments.id, attachmentId));
      if (!current) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({
        attachment: toAttachmentDto(current, currentAsset ?? null),
      });
    }
    await syncAssetProcessing(asset.id, {
      processingStatus: "validating",
      processingProgress: 10,
      processingError: null,
    });
  }

  const [claimed] = asset
    ? [attachment]
    : await db
        .update(reportAttachments)
        .set({
          processingStatus: "validating",
          processingProgress: 10,
          processingError: null,
        })
        .where(
          and(
            eq(reportAttachments.id, attachmentId),
            eq(reportAttachments.reportId, reportId),
            isNull(reportAttachments.deletedAt),
            inArray(reportAttachments.processingStatus, [
              ...FINALIZE_CLAIM_STATUSES,
            ])
          )
        )
        .returning();

  if (!claimed) {
    const [current] = await db
      .select()
      .from(reportAttachments)
      .where(
        and(
          eq(reportAttachments.id, attachmentId),
          eq(reportAttachments.reportId, reportId),
          isNull(reportAttachments.deletedAt)
        )
      );
    if (!current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ attachment: toAttachmentDto(current, asset) });
  }

  try {
    const storage = getAttachmentStorage();
    const limits = getAttachmentLimits();
    const stagingMetadata = await storage.getObjectMetadata(
      storageSource.stagingObjectKey
    );
    if (
      Math.abs(stagingMetadata.sizeBytes - storageSource.sizeBytes) >
      SIZE_TOLERANCE_BYTES
    ) {
      throw new Error("Uploaded file size did not match reservation");
    }
    if (stagingMetadata.sizeBytes > limits.maxAttachmentBytes) {
      throw new Error("Uploaded file exceeds size limit");
    }
    const kind = kindFromMime(storageSource.mimeType);
    if (!kind) {
      throw new Error("Unsupported attachment type");
    }
    if (kindFromMime(stagingMetadata.contentType) !== kind) {
      throw new Error("Uploaded object type does not match the reservation");
    }

    const buffer = await storage.readObjectBuffer(storageSource.stagingObjectKey);
    const { pageCount } =
      kind === "docx"
        ? validateDocx(buffer)
        : await validatePdf(buffer, { maxPages: limits.maxAttachmentPages });
    const scanResult = await getMalwareScanner().scan(buffer, attachment.filename);
    if (!scanResult.ok) {
      throw new Error(scanResult.reason);
    }

    const sha256 = createHash("sha256").update(buffer).digest("hex");
    await promoteObject(
      storageSource.stagingObjectKey,
      storageSource.permanentObjectKey
    );
    const permanentMetadata = await storage.getObjectMetadata(
      storageSource.permanentObjectKey
    );

    const processingPatch = {
      processingStatus: "queued" as const,
      processingProgress: 0,
      processingPage: null,
      processingError: null,
      sha256,
      pageCount,
      gcsGeneration: permanentMetadata.generation,
      crc32c: permanentMetadata.crc32c,
      sizeBytes: permanentMetadata.sizeBytes,
    };

    if (asset) {
      await syncAssetProcessing(asset.id, processingPatch);
    } else {
      await db
        .update(reportAttachments)
        .set(processingPatch)
        .where(
          and(
            eq(reportAttachments.id, attachmentId),
            eq(reportAttachments.processingStatus, "validating")
          )
        );
    }

    const [updated] = await db
      .select()
      .from(reportAttachments)
      .where(eq(reportAttachments.id, attachmentId));
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const updatedAsset = asset
      ? (
          await db
            .select()
            .from(attachmentAssets)
            .where(eq(attachmentAssets.id, asset.id))
            .limit(1)
        )[0]
      : null;

    await startDocumentIngest(attachmentId, permanentMetadata.generation);
    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "attachment_uploaded",
      entityType: "attachment",
      entityId: attachmentId,
      reportId,
      summary: `Attachment uploaded: ${attachment.filename}`,
      newValue: {
        filename: attachment.filename,
        sizeBytes: permanentMetadata.sizeBytes,
        pageCount,
        sha256,
        generation: permanentMetadata.generation,
      },
    });

    return NextResponse.json({
      attachment: toAttachmentDto(updated, updatedAsset ?? null),
    });
  } catch (error) {
    if (error instanceof AttachmentPageBudgetExceededError) {
      const failPatch = {
        processingStatus: "failed" as const,
        processingProgress: 0,
        processingError: error.message,
      };
      if (asset) {
        await syncAssetProcessing(asset.id, failPatch);
      } else {
        await db
          .update(reportAttachments)
          .set(failPatch)
          .where(eq(reportAttachments.id, attachmentId));
      }
      return attachmentPageBudgetExceededResponse(error);
    }
    const message = sanitizeFinalizeError(error);
    const failPatch = {
      processingStatus: "failed" as const,
      processingProgress: 0,
      processingError: message,
    };
    if (asset) {
      await syncAssetProcessing(asset.id, failPatch);
    } else {
      await db
        .update(reportAttachments)
        .set(failPatch)
        .where(eq(reportAttachments.id, attachmentId));
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function promoteObject(fromKey: string, toKey: string): Promise<void> {
  const storage = getAttachmentStorage();
  try {
    await storage.copyObject(fromKey, toKey);
  } catch {
    await storage.getObjectMetadata(toKey);
  }
}

function sanitizeFinalizeError(error: unknown): string {
  if (!(error instanceof Error)) return "Attachment validation failed";
  const message = error.message;
  if (message.includes("Malware scanning")) {
    return "Attachment malware scan failed";
  }
  if (message.includes("Malware")) {
    return "Attachment malware scan failed";
  }
  // Preserve ingest-start / ingest-run messages if they bubble here.
  if (message.includes("Document ingestion") || message.includes("ingest")) {
    return message.slice(0, 300);
  }
  if (
    message.includes("PDF") ||
    message.includes("Word") ||
    message.includes(".docx") ||
    message.includes("file") ||
    message.includes("object") ||
    message.includes("type")
  ) {
    return message;
  }
  return "Attachment validation failed";
}
