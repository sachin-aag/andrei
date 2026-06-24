import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";

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

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "report_purged",
    entityType: "report",
    entityId: reportId,
    reportId,
    summary: `Permanently purged report ${existing.deviationNo}`,
    oldValue: {
      deviationNo: existing.deviationNo,
      status: existing.status,
      deletedAt: existing.deletedAt,
      deletedById: existing.deletedById,
    },
    newValue: { reason: parsed.data.reason },
  });

  await db.delete(reports).where(eq(reports.id, reportId));
  return NextResponse.json({ ok: true });
}
