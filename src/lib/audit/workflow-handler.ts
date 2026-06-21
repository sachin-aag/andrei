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
  parseSigningPasswordFromRequest,
  requireSigningPassword,
} from "@/lib/audit/workflow-sign";

type WorkflowSignOptions = {
  user: WorkspaceUser;
  reportId: string;
  meaning: SignatureMeaning;
  newStatus: "submitted" | "approved" | "feedback";
  auditAction: "report_submitted" | "report_approved" | "report_feedback";
  forbiddenMessage: string;
  authorize: (user: WorkspaceUser, report: typeof reports.$inferSelect) => boolean;
};

export async function handleWorkflowSignRequest(
  req: Request,
  reportId: string,
  options: WorkflowSignOptions
) {
  const password = await parseSigningPasswordFromRequest(req);
  const passwordError = await requireSigningPassword(options.user.id, password);
  if (passwordError) return passwordError;

  const [existing] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!options.authorize(options.user, existing)) {
    return NextResponse.json({ error: options.forbiddenMessage }, { status: 403 });
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
