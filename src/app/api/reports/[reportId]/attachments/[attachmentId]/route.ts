import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { ATTACHMENT_DESCRIPTION_MAX } from "@/lib/attachments/description";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { validateFolderPlacement } from "@/lib/attachments/folders";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    folderId: z.string().min(1).nullable().optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    /** Null or empty clears the description. */
    description: z
      .string()
      .max(ATTACHMENT_DESCRIPTION_MAX)
      .nullable()
      .optional(),
    /** Client could not finish the byte PUT (CORS, timeout, network). */
    uploadFailed: z.literal(true).optional(),
    error: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      data.folderId !== undefined ||
      data.filename !== undefined ||
      data.description !== undefined ||
      data.uploadFailed === true,
    { message: "Expected folderId, filename, description, or uploadFailed" }
  );

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const currentUser = await getCurrentUser();
  const { reportId, attachmentId } = await params;
  const access = await requireReportAccess(reportId, currentUser);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const attachment = await loadActiveAttachment(reportId, attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ attachment: toAttachmentDto(attachment) });
}

/** Moves, renames, or updates description for an attachment; or records upload failure.
 * Folder placement, rename, and description are not audited — they carry no report
 * content bytes (unlike upload/delete). Description is user metadata for AI context. */
export async function PATCH(
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

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const attachment = await loadActiveAttachment(reportId, attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.uploadFailed) {
    if (attachment.processingStatus !== "uploading") {
      return NextResponse.json({ attachment: toAttachmentDto(attachment) });
    }
    const [updated] = await db
      .update(reportAttachments)
      .set({
        processingStatus: "failed",
        processingProgress: 0,
        processingError:
          parsed.data.error?.trim() || "Upload did not complete",
      })
      .where(
        and(
          eq(reportAttachments.id, attachmentId),
          eq(reportAttachments.reportId, reportId),
          isNull(reportAttachments.deletedAt)
        )
      )
      .returning();
    return NextResponse.json({ attachment: toAttachmentDto(updated) });
  }

  const updates: {
    folderId?: string | null;
    filename?: string;
    description?: string | null;
  } = {};

  if (parsed.data.folderId !== undefined) {
    const folderId = parsed.data.folderId;
    const placementError = await validateFolderPlacement({
      reportId,
      parentId: folderId,
      folderId: null,
    });
    if (placementError) {
      return NextResponse.json(
        { error: placementError.error },
        { status: placementError.status }
      );
    }
    updates.folderId = folderId;
  }

  if (parsed.data.filename !== undefined) {
    updates.filename = parsed.data.filename;
  }

  if (parsed.data.description !== undefined) {
    const trimmed = parsed.data.description?.trim() ?? "";
    updates.description = trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ attachment: toAttachmentDto(attachment) });
  }

  const [updated] = await db
    .update(reportAttachments)
    .set(updates)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .returning();

  return NextResponse.json({ attachment: toAttachmentDto(updated) });
}

export async function DELETE(
  _req: Request,
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

  const attachment = await loadActiveAttachment(reportId, attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [deleted] = await db
    .update(reportAttachments)
    .set({
      deletedAt: new Date(),
      deletedById: access.user.id,
    })
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId),
        isNull(reportAttachments.deletedAt)
      )
    )
    .returning();

  await recordAuditEvent({
    actor: auditActorFromUser(access.user),
    action: "attachment_deleted",
    entityType: "attachment",
    entityId: attachmentId,
    reportId,
    summary: `Attachment deleted: ${attachment.filename}`,
    oldValue: {
      filename: attachment.filename,
      sizeBytes: attachment.sizeBytes,
      pageCount: attachment.pageCount,
      processingStatus: attachment.processingStatus,
    },
  });

  return NextResponse.json({ attachment: toAttachmentDto(deleted) });
}

async function loadActiveAttachment(reportId: string, attachmentId: string) {
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
  return attachment;
}
