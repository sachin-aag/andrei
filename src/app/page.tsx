import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportManagers, reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { CreateReportButton } from "@/components/dashboard/create-report-button";
import { ReportList } from "@/components/dashboard/report-list";
import { withTransientRetry } from "@/lib/db/with-transient-retry";
import {
  listReportManagerIdsByReportIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";
import { activeReportsFilter } from "@/lib/reports/tombstone";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/reports");

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);
  const managers = workspaceUsers.filter((entry) => entry.role === "manager");
  const usersById = Object.fromEntries(
    workspaceUsers.map((entry) => [entry.id, { name: entry.name }])
  );

  const reportRows =
    user.role === "qa"
      ? await withTransientRetry("dashboard.qaReports", () =>
          db
            .select()
            .from(reports)
            .where(activeReportsFilter())
            .orderBy(desc(reports.updatedAt))
        )
      : user.role === "engineer"
      ? await withTransientRetry("dashboard.engineerReports", () =>
          db
            .select()
            .from(reports)
            .where(and(eq(reports.authorId, user.id), activeReportsFilter()))
            .orderBy(desc(reports.updatedAt))
        )
      : await withTransientRetry("dashboard.managerReports", () =>
          db
            .select()
            .from(reports)
            .where(
              and(
                activeReportsFilter(),
                or(
                  eq(reports.assignedManagerId, user.id),
                  sql`exists (
                  select 1 from ${reportManagers}
                  where ${reportManagers.reportId} = ${reports.id}
                  and ${reportManagers.managerId} = ${user.id}
                )`,
                  eq(reports.status, "submitted"),
                  eq(reports.status, "in_review")
                )
              )
            )
            .orderBy(desc(reports.updatedAt))
        );
  const managerIdsByReportId = await listReportManagerIdsByReportIds(
    reportRows.map((report) => report.id)
  );
  const myReports = reportRows.map((report) =>
    withAssignedManagerIds(report, managerIdsByReportId.get(report.id) ?? [])
  );

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <ViewTransition
        enter={{ "nav-back": "nav-back", default: "none" }}
        exit={{ "nav-forward": "nav-forward", default: "none" }}
        default="none"
      >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-10 py-6 border-b border-[var(--border)]">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {user.role === "engineer"
                ? "My Reports"
                : user.role === "qa"
                  ? "All Reports"
                  : "Reports Queue"}
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {user.role === "engineer"
                ? "Create and manage your deviation investigation reports."
                : user.role === "qa"
                  ? "Read-only access to investigation reports and audit trails."
                  : "Review submitted investigation reports from quality engineers."}
            </p>
          </div>
          {user.role === "engineer" && (
            <CreateReportButton managers={managers} />
          )}
        </div>

        <div className="flex-1 overflow-auto px-10 py-6">
          <ReportList
            reports={myReports}
            currentUserId={user.id}
            userRole={user.role}
            usersById={usersById}
          />
        </div>
      </div>
      </ViewTransition>
    </AppShell>
  );
}
