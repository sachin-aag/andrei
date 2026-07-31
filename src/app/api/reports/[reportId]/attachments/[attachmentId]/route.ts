import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";

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
