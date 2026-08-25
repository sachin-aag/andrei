import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import { getCustomerPack } from "@/lib/customers/packs";
import { canViewReport } from "@/lib/reports/access";
import { assignHiddenExpertReviewerToReport } from "@/lib/reports/ensure-hidden-expert-reviewer";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import { EXPERT_REVIEW_NOTE_MAX_LENGTH } from "@/lib/reports/hidden-expert-reviewer";
import { sendExpertReviewEmail } from "@/lib/reports/send-expert-review-email";

const bodySchema = z.object({
  note: z.string().max(EXPERT_REVIEW_NOTE_MAX_LENGTH).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  if (!getCustomerPack().expertReviewEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reportId } = await params;
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);
  if (!canViewReport(user, reportWithManagers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (user.role !== "admin" && user.id !== report.authorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (report.status === "approved") {
    return NextResponse.json(
      { error: "Approved reports cannot be sent for expert review" },
      { status: 409 }
    );
  }
  if (report.deletedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const note = parsed.data.note?.trim() ?? "";

  await assignHiddenExpertReviewerToReport(reportId);

  try {
    await sendExpertReviewEmail({
      reportId,
      documentNo: report.documentNo,
      requesterName: user.name,
      requesterEmail: user.email,
      note,
    });
  } catch (error) {
    console.error("Failed to send expert review email", error);
    return NextResponse.json(
      { error: "Could not send the expert review email. Try again." },
      { status: 502 }
    );
  }

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "report_updated",
    entityType: "report",
    entityId: reportId,
    reportId,
    summary: `Requested expert review of ${report.documentNo}`,
    newValue: {
      expertReviewRequested: true,
      note,
    },
  });

  return NextResponse.json({ ok: true });
}
