import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { reportAttachments } from "@/db/schema";
import {
  requireReportAttachmentAccess,
  requireReportAttachmentModify,
} from "@/lib/attachments/route-helpers";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { deleteObject } from "@/lib/storage/gcs";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const { reportId, attachmentId } = await params;
  const access = await requireReportAttachmentAccess(reportId);
  if ("error" in access) return access.error;

  const [row] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId)
      )
    );

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    viewUrl: `/api/reports/${reportId}/attachments/${attachmentId}/content`,
    attachment: row,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; attachmentId: string }> }
) {
  const { reportId, attachmentId } = await params;
  const access = await requireReportAttachmentModify(reportId);
  if ("error" in access) return access.error;

  const [row] = await db
    .select()
    .from(reportAttachments)
    .where(
      and(
        eq(reportAttachments.id, attachmentId),
        eq(reportAttachments.reportId, reportId)
      )
    );

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await deleteObject(row.gcsObjectKey);
    await db.delete(reportAttachments).where(eq(reportAttachments.id, row.id));

    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "attachment_deleted",
      entityType: "attachment",
      entityId: row.id,
      reportId,
      summary: `Deleted attachment ${row.filename}`,
      oldValue: {
        id: row.id,
        filename: row.filename,
        sizeBytes: row.sizeBytes,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete attachment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
