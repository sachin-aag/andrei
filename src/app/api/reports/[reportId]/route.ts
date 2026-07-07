import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewReport } from "@/lib/reports/access";
import { loadReportSubtables } from "@/lib/reports/bundle";
import {
  DUPLICATE_DEVIATION_NO_ERROR,
  isDeviationNoTaken,
  normalizeDeviationNo,
} from "@/lib/reports/deviation-no";
import { auditActorFromUser, recordAuditEvent } from "@/lib/audit";
import {
  assignedManagerIdsForReport,
  listReportManagerIds,
  normalizeAssignedManagerIds,
  primaryAssignedManagerId,
  syncReportManagers,
  validateAssignedManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  // Authorize before loading the heavier section/eval/comment rows so a
  // forbidden request never pays for the full bundle fetch.
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);
  if (!canViewReport(user, reportWithManagers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sections, evaluations, comments, attachments } =
    await loadReportSubtables(reportId);

  return NextResponse.json({
    report: reportWithManagers,
    sections,
    evaluations,
    comments,
    attachments,
  });
}

const patchSchema = z.object({
  deviationNo: z.string().optional(),
  date: z.string().optional(),
  toolsUsed: z
    .object({
      sixM: z.boolean(),
      fiveWhy: z.boolean(),
      brainstorming: z.boolean(),
    })
    .optional(),
  otherTools: z.string().optional(),
  assignedManagerId: z.string().nullable().optional(),
  assignedManagerIds: z.array(z.string()).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const [existingReport] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!existingReport) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (user.role !== "admin" && user.id !== existingReport.authorId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existingReport.status === "approved") {
    return NextResponse.json(
      { error: "Approved reports cannot be edited" },
      { status: 409 }
    );
  }

  const parse = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = parse.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.date) updates.date = new Date(parsed.date);
  if (parsed.toolsUsed !== undefined) updates.toolsUsed = parsed.toolsUsed;
  if (parsed.otherTools !== undefined) updates.otherTools = parsed.otherTools;

  if (parsed.deviationNo !== undefined) {
    const normalized = normalizeDeviationNo(parsed.deviationNo);
    if (!normalized) {
      return NextResponse.json({ error: "Deviation number is required" }, { status: 400 });
    }
    if (await isDeviationNoTaken(normalized, existingReport.authorId, reportId)) {
      return NextResponse.json({ error: DUPLICATE_DEVIATION_NO_ERROR }, { status: 409 });
    }
    updates.deviationNo = normalized;
  }

  const managerIdsChanged =
    parsed.assignedManagerIds !== undefined ||
    parsed.assignedManagerId !== undefined;
  const nextManagerIds = managerIdsChanged
    ? parsed.assignedManagerIds !== undefined
      ? normalizeAssignedManagerIds(parsed.assignedManagerIds)
      : normalizeAssignedManagerIds([parsed.assignedManagerId ?? null])
    : undefined;
  const existingManagerIds = await listReportManagerIds(reportId);
  const oldAssignedManagerIds = assignedManagerIdsForReport(
    existingReport,
    existingManagerIds
  );

  if (nextManagerIds) {
    const validation = await validateAssignedManagerIds(nextManagerIds);
    if (!validation.ok) {
      return NextResponse.json(
        { error: "One or more selected reviewers are not managers" },
        { status: 400 }
      );
    }
    updates.assignedManagerId = primaryAssignedManagerId(nextManagerIds);
  }

  const [updated] = await db
    .update(reports)
    .set(updates)
    .where(eq(reports.id, reportId))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (nextManagerIds) {
    await syncReportManagers(reportId, nextManagerIds);
  }
  const updatedWithManagers = withAssignedManagerIds(
    updated,
    nextManagerIds ?? existingManagerIds
  );

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "report_updated",
    entityType: "report",
    entityId: reportId,
    reportId,
    summary: `Updated report metadata`,
    oldValue: {
      deviationNo: existingReport.deviationNo,
      date: existingReport.date,
      toolsUsed: existingReport.toolsUsed,
      otherTools: existingReport.otherTools,
      assignedManagerId: existingReport.assignedManagerId,
      assignedManagerIds: oldAssignedManagerIds,
    },
    newValue: {
      deviationNo: updated.deviationNo,
      date: updated.date,
      toolsUsed: updated.toolsUsed,
      otherTools: updated.otherTools,
      assignedManagerId: updated.assignedManagerId,
      assignedManagerIds: updatedWithManagers.assignedManagerIds,
    },
  });

  return NextResponse.json({ report: updatedWithManagers });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { reportId } = await params;

  const [existing] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!existing) return NextResponse.json({ ok: true });
  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (existing.status === "approved") {
    return NextResponse.json(
      { error: "Approved reports cannot be deleted" },
      { status: 409 }
    );
  }
  if (existing.deletedAt) {
    return NextResponse.json({ ok: true });
  }

  const deletedAt = new Date();
  await db
    .update(reports)
    .set({ deletedAt, deletedById: user.id, updatedAt: deletedAt })
    .where(eq(reports.id, reportId));

  await recordAuditEvent({
    actor: auditActorFromUser(user),
    action: "report_deleted",
    entityType: "report",
    entityId: reportId,
    reportId,
    summary: `Soft-deleted report ${existing.deviationNo}`,
    oldValue: {
      deviationNo: existing.deviationNo,
      status: existing.status,
      authorId: existing.authorId,
    },
    newValue: { deletedAt: deletedAt.toISOString(), deletedById: user.id },
  });

  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
