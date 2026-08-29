import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { kindFromMime } from "@/lib/attachments/file-types";
import { getAttachmentLimits } from "@/lib/attachments/limits";
import { getMalwareScanner } from "@/lib/attachments/malware-scan";
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
  if (
    attachment.processingStatus === "ready" &&
    attachment.gcsGeneration &&
    (!requestedGeneration || requestedGeneration === attachment.gcsGeneration)
  ) {
    return NextResponse.json({ attachment: toAttachmentDto(attachment) });
  }
  if (
    IN_FLIGHT_STATUSES.includes(
      attachment.processingStatus as (typeof IN_FLIGHT_STATUSES)[number]
    )
  ) {
    return NextResponse.json({ attachment: toAttachmentDto(attachment) });
  }

  const [claimed] = await db
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
        inArray(reportAttachments.processingStatus, [...FINALIZE_CLAIM_STATUSES])
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
    return NextResponse.json({ attachment: toAttachmentDto(current) });
  }

  try {
    const storage = getAttachmentStorage();
    const limits = getAttachmentLimits();
    const stagingMetadata = await storage.getObjectMetadata(claimed.stagingObjectKey);
    if (
      Math.abs(stagingMetadata.sizeBytes - claimed.sizeBytes) >
      SIZE_TOLERANCE_BYTES
    ) {
      throw new Error("Uploaded file size did not match reservation");
    }
    if (stagingMetadata.sizeBytes > limits.maxAttachmentBytes) {
      throw new Error("Uploaded file exceeds size limit");
    }
    // Kind is derived from the canonical MIME persisted at reservation time.
    const kind = kindFromMime(claimed.mimeType);
    if (!kind) {
      throw new Error("Unsupported attachment type");
    }
    if (kindFromMime(stagingMetadata.contentType) !== kind) {
      throw new Error("Uploaded object type does not match the reservation");
    }

    const buffer = await storage.readObjectBuffer(claimed.stagingObjectKey);
    const { pageCount } =
      kind === "docx"
        ? validateDocx(buffer)
        : await validatePdf(buffer, { maxPages: limits.maxAttachmentPages });
    const scanResult = await getMalwareScanner().scan(buffer, claimed.filename);
    if (!scanResult.ok) {
      throw new Error(scanResult.reason);
    }

    const sha256 = createHash("sha256").update(buffer).digest("hex");
    await promoteObject(
      claimed.stagingObjectKey,
      claimed.permanentObjectKey
    );
    const permanentMetadata = await storage.getObjectMetadata(
      claimed.permanentObjectKey
    );

    const [updated] = await db
      .update(reportAttachments)
      .set({
        processingStatus: "queued",
        processingProgress: 0,
        processingPage: null,
        processingError: null,
        sha256,
        pageCount,
        gcsGeneration: permanentMetadata.generation,
        crc32c: permanentMetadata.crc32c,
        sizeBytes: permanentMetadata.sizeBytes,
      })
      .where(
        and(
          eq(reportAttachments.id, attachmentId),
          eq(reportAttachments.processingStatus, "validating")
        )
      )
      .returning();

    if (!updated) {
      const [current] = await db
        .select()
        .from(reportAttachments)
        .where(eq(reportAttachments.id, attachmentId));
      if (!current) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ attachment: toAttachmentDto(current) });
    }

    await startDocumentIngest(attachmentId, permanentMetadata.generation);
    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "attachment_uploaded",
      entityType: "attachment",
      entityId: attachmentId,
      reportId,
      summary: `Attachment uploaded: ${claimed.filename}`,
      newValue: {
        filename: claimed.filename,
        sizeBytes: permanentMetadata.sizeBytes,
        pageCount,
        sha256,
        generation: permanentMetadata.generation,
      },
    });

    return NextResponse.json({ attachment: toAttachmentDto(updated) });
  } catch (error) {
    if (error instanceof AttachmentPageBudgetExceededError) {
      await db
        .update(reportAttachments)
        .set({
          processingStatus: "failed",
          processingProgress: 0,
          processingError: error.message,
        })
        .where(eq(reportAttachments.id, attachmentId));
      return attachmentPageBudgetExceededResponse(error);
    }
    const message = sanitizeFinalizeError(error);
    await db
      .update(reportAttachments)
      .set({
        processingStatus: "failed",
        processingProgress: 0,
        processingError: message,
      })
      .where(eq(reportAttachments.id, attachmentId));
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
