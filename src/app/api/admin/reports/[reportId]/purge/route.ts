import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { reportAttachments, reports, storageOutbox } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import {
  collectAttachmentPurgeObjects,
  processPurgeStorageOutboxRows,
} from "@/lib/reports/purge-storage-outbox";

const purgeSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = purgeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A documented reason is required to permanently delete a report." },
      { status: 400 }
    );
  }

  const { reportId } = await params;
  const [existing] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!existing) return NextResponse.json({ ok: true });
  if (!existing.deletedAt) {
    return NextResponse.json(
      { error: "Only tombstoned reports can be permanently purged." },
      { status: 409 }
    );
  }

  const attachmentRows = await db
    .select({
      id: reportAttachments.id,
      stagingObjectKey: reportAttachments.stagingObjectKey,
      permanentObjectKey: reportAttachments.permanentObjectKey,
      gcsGeneration: reportAttachments.gcsGeneration,
    })
    .from(reportAttachments)
    .where(eq(reportAttachments.reportId, reportId));
  const purgeObjects = collectAttachmentPurgeObjects(attachmentRows);

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "report_purged",
    entityType: "report",
    entityId: reportId,
    reportId,
    summary: `Permanently purged report ${existing.documentNo}`,
    oldValue: {
      documentNo: existing.documentNo,
      status: existing.status,
      deletedAt: existing.deletedAt,
      deletedById: existing.deletedById,
    },
    newValue: { reason: parsed.data.reason },
  });

  const outboxRows =
    purgeObjects.length === 0
      ? []
      : await db
          .insert(storageOutbox)
          .values(
            purgeObjects.map((object) => ({
              kind: "purge_delete",
              bucket: object.bucket,
              objectKey: object.objectKey,
              gcsGeneration: object.gcsGeneration,
              reportId,
              attachmentId: object.attachmentId,
            }))
          )
          .returning();

  await db.delete(reports).where(eq(reports.id, reportId));
  const storagePurge = await processPurgeStorageOutboxRows(outboxRows);
  return NextResponse.json({ ok: true, storagePurge });
}
