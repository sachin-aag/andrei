import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import {
  auditActorFromUser,
  recordAuditEvent,
  recordElectronicSignature,
} from "@/lib/audit";
import type { SignatureMeaning } from "@/db/schema";
import {
  parseSigningCredentialsFromRequest,
  requireSigningCredentials,
} from "@/lib/audit/workflow-sign";
import { assertValidStatusTransition } from "@/lib/audit/workflow-transitions";
import {
  assertManagerCanActOnReport,
  assertSegregationOfDutiesForApproval,
} from "@/lib/reports/manager-authorization";
import { listReportManagerIds } from "@/lib/reports/managers";
import { assertReportReadyForSubmit } from "@/lib/reports/submit-validation";
import { isReportDeleted } from "@/lib/reports/tombstone";

type WorkflowSignOptions = {
  user: WorkspaceUser;
  reportId: string;
  meaning: SignatureMeaning;
  newStatus: "submitted" | "approved" | "feedback";
  auditAction: "report_submitted" | "report_approved" | "report_feedback";
  forbiddenMessage: string;
  authorize: (user: WorkspaceUser, report: typeof reports.$inferSelect) => boolean;
  beforeSign?: (
    report: typeof reports.$inferSelect,
    managerIds: string[]
  ) => Promise<NextResponse | null>;
};

export async function handleWorkflowSignRequest(
  req: Request,
  reportId: string,
  options: WorkflowSignOptions
) {
  const credentials = await parseSigningCredentialsFromRequest(req);
  const credentialError = await requireSigningCredentials(options.user, credentials);
  if (credentialError) return credentialError;

  const [existing] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isReportDeleted(existing)) {
    return NextResponse.json({ error: "Report has been deleted" }, { status: 410 });
  }

  if (!options.authorize(options.user, existing)) {
    return NextResponse.json({ error: options.forbiddenMessage }, { status: 403 });
  }

  const transition = assertValidStatusTransition(existing.status, options.newStatus);
  if (!transition.ok) {
    return NextResponse.json({ error: transition.message }, { status: 409 });
  }

  if (options.newStatus === "submitted") {
    const submitCheck = await assertReportReadyForSubmit(reportId);
    if (!submitCheck.ok) {
      return NextResponse.json(
        { error: submitCheck.message, placeholders: submitCheck.placeholders },
        { status: 400 }
      );
    }
  }

  const managerIds = await listReportManagerIds(reportId);

  if (options.newStatus === "approved" || options.newStatus === "feedback") {
    const managerAuth = assertManagerCanActOnReport(
      options.user.id,
      existing,
      managerIds
    );
    if (!managerAuth.ok) {
      return NextResponse.json({ error: managerAuth.message }, { status: 403 });
    }
  }

  if (options.newStatus === "approved") {
    const sod = assertSegregationOfDutiesForApproval(
      options.user.id,
      existing.reviewedById
    );
    if (!sod.ok) {
      return NextResponse.json({ error: sod.message }, { status: 403 });
    }
  }

  if (options.beforeSign) {
    const beforeError = await options.beforeSign(existing, managerIds);
    if (beforeError) return beforeError;
  }

  const actor = auditActorFromUser(options.user);

  const [updated] = await db
    .update(reports)
    .set({ status: options.newStatus, updatedAt: new Date() })
    .where(eq(reports.id, reportId))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordElectronicSignature({
    actor,
    reportId,
    meaning: options.meaning,
  });

  await recordAuditEvent({
    actor,
    action: options.auditAction,
    entityType: "report",
    entityId: reportId,
    reportId,
    summary: `Report status changed to ${options.newStatus}`,
    oldValue: { status: existing.status },
    newValue: { status: options.newStatus },
  });

  return NextResponse.json({ report: updated });
}
