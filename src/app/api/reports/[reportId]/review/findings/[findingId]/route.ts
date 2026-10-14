import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reviewFindings } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { observeRouteHandler } from "@/lib/observability/langfuse";

const bodySchema = z.object({
  status: z.enum(["verified", "dismissed", "open"]),
});

export const PATCH = observeRouteHandler(
  "report-review-finding-patch",
  handlePatch
);

async function handlePatch(
  req: Request,
  { params }: { params: Promise<{ reportId: string; findingId: string }> }
) {
  const user = await getCurrentUser();
  const { reportId, findingId } = await params;
  const access = await requireReportAccess(reportId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!access.canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(reviewFindings)
    .where(
      and(eq(reviewFindings.id, findingId), eq(reviewFindings.reportId, reportId))
    );
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextStatus = parsed.data.status;
  const verifiedAt = nextStatus === "verified" ? new Date() : null;
  const verifiedBy = nextStatus === "verified" ? access.user.id : null;

  const [updated] = await db
    .update(reviewFindings)
    .set({
      status: nextStatus,
      verifiedAt,
      verifiedBy,
    })
    .where(eq(reviewFindings.id, findingId))
    .returning();

  if (nextStatus === "verified") {
    await recordAuditEvent({
      actor: auditActorFromUser(access.user),
      action: "review_finding_verified",
      entityType: "review",
      entityId: findingId,
      reportId,
      summary: `Verified review finding: ${row.message.slice(0, 180)}`,
      oldValue: { status: row.status },
      newValue: { status: nextStatus, checkId: row.checkId },
    });
  }

  return NextResponse.json({ finding: updated });
}
