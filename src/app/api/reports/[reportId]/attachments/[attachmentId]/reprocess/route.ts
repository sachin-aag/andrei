import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import { toAttachmentDto } from "@/lib/attachments/dto";
import { startDocumentIngest } from "@/lib/attachments/start-ingest";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
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
  if (attachment.processingStatus !== "failed") {
    return NextResponse.json(
      { error: "Only failed attachments can be reprocessed" },
      { status: 400 }
    );
  }
  if (!attachment.gcsGeneration) {
    return NextResponse.json(
      { error: "Attachment has no finalized source document" },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(reportAttachments)
    .set({
      processingStatus: "queued",
      processingProgress: 0,
      processingError: null,
    })
    .where(eq(reportAttachments.id, attachmentId))
    .returning();

  await startDocumentIngest(attachmentId, attachment.gcsGeneration);
  await recordAuditEvent({
    actor: auditActorFromUser(access.user),
    action: "attachment_reprocessed",
    entityType: "attachment",
    entityId: attachmentId,
    reportId,
    summary: `Attachment reprocessed: ${attachment.filename}`,
    newValue: {
      generation: attachment.gcsGeneration,
      previousStatus: attachment.processingStatus,
    },
  });

  return NextResponse.json({ attachment: toAttachmentDto(updated) });
}
