import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { desc, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { CreateReportButton } from "@/components/dashboard/create-report-button";
import { ReportList } from "@/components/dashboard/report-list";
import { withTransientRetry } from "@/lib/db/with-transient-retry";

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

  const myReports =
    user.role === "engineer"
      ? await withTransientRetry("dashboard.engineerReports", () =>
          db
            .select()
            .from(reports)
            .where(eq(reports.authorId, user.id))
            .orderBy(desc(reports.updatedAt))
        )
      : await withTransientRetry("dashboard.managerReports", () =>
          db
            .select()
            .from(reports)
            .where(
              or(
                eq(reports.assignedManagerId, user.id),
                eq(reports.status, "submitted"),
                eq(reports.status, "in_review")
              )
            )
            .orderBy(desc(reports.updatedAt))
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
              {user.role === "engineer" ? "My Reports" : "Reports Queue"}
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {user.role === "engineer"
                ? "Create and manage your deviation investigation reports."
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
