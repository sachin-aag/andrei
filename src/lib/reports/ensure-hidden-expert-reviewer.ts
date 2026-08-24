import { and, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { reportManagers, reports, workspaceUsers } from "@/db/schema";
import {
  HIDDEN_EXPERT_REVIEWER_EMAIL,
  HIDDEN_EXPERT_REVIEWER_NAME,
  HIDDEN_EXPERT_REVIEWER_TITLE,
  withHiddenExpertReviewer,
} from "@/lib/reports/hidden-expert-reviewer";
import {
  listReportManagerIds,
  syncReportManagers,
} from "@/lib/reports/managers";

export type HiddenExpertReviewer = {
  id: string;
  email: string;
};

/**
 * Upsert Aditya's manager account. Existing passwords are left untouched so
 * demo seed logins keep working; new environments get a magic-link-only user.
 */
export async function ensureHiddenExpertReviewer(): Promise<HiddenExpertReviewer> {
  const email = HIDDEN_EXPERT_REVIEWER_EMAIL;
  const [existing] = await db
    .select({
      id: workspaceUsers.id,
      role: workspaceUsers.role,
      deactivatedAt: workspaceUsers.deactivatedAt,
    })
    .from(workspaceUsers)
    .where(eq(workspaceUsers.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(workspaceUsers)
      .set({
        role: "manager",
        deactivatedAt: null,
        name: HIDDEN_EXPERT_REVIEWER_NAME,
        title: HIDDEN_EXPERT_REVIEWER_TITLE,
      })
      .where(eq(workspaceUsers.id, existing.id));
    return { id: existing.id, email };
  }

  const id = createId();
  await db.insert(workspaceUsers).values({
    id,
    name: HIDDEN_EXPERT_REVIEWER_NAME,
    email,
    role: "manager",
    title: HIDDEN_EXPERT_REVIEWER_TITLE,
    passwordHash: null,
    mustChangePassword: false,
  });
  return { id, email };
}

export async function assignedManagerIdsWithHiddenExpert(
  managerIds: readonly string[]
): Promise<string[]> {
  const expert = await ensureHiddenExpertReviewer();
  return withHiddenExpertReviewer(managerIds, expert.id);
}

export async function assignHiddenExpertReviewerToReport(
  reportId: string
): Promise<HiddenExpertReviewer> {
  const expert = await ensureHiddenExpertReviewer();
  const existingIds = await listReportManagerIds(reportId);
  const nextIds = withHiddenExpertReviewer(existingIds, expert.id);
  if (nextIds.length !== existingIds.length) {
    await syncReportManagers(reportId, nextIds);
  }

  const [report] = await db
    .select({ assignedManagerId: reports.assignedManagerId })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);
  if (report && !report.assignedManagerId) {
    await db
      .update(reports)
      .set({ assignedManagerId: expert.id })
      .where(eq(reports.id, reportId));
  }

  return expert;
}

/**
 * Attach the hidden expert to every live report. Used on deploy so MJ / demo /
 * Convergent databases all get Aditya onto existing rows.
 */
export async function assignHiddenExpertReviewerToAllReports(): Promise<{
  expertId: string;
  reportsLinked: number;
}> {
  const expert = await ensureHiddenExpertReviewer();

  const liveReports = await db
    .select({
      id: reports.id,
      assignedManagerId: reports.assignedManagerId,
    })
    .from(reports)
    .where(isNull(reports.deletedAt));

  if (liveReports.length === 0) {
    return { expertId: expert.id, reportsLinked: 0 };
  }

  const alreadyLinked = await db
    .select({ reportId: reportManagers.reportId })
    .from(reportManagers)
    .where(eq(reportManagers.managerId, expert.id));
  const linkedIds = new Set(alreadyLinked.map((row) => row.reportId));

  const missing = liveReports.filter((report) => !linkedIds.has(report.id));
  if (missing.length > 0) {
    await db.insert(reportManagers).values(
      missing.map((report) => ({
        reportId: report.id,
        managerId: expert.id,
        sortOrder: 1000,
      }))
    );
  }

  const reportsMissingPrimary = liveReports.filter(
    (report) => !report.assignedManagerId
  );
  if (reportsMissingPrimary.length > 0) {
    await db
      .update(reports)
      .set({ assignedManagerId: expert.id })
      .where(and(isNull(reports.assignedManagerId), isNull(reports.deletedAt)));
  }

  return { expertId: expert.id, reportsLinked: missing.length };
}
