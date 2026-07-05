import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AdminReportsPanel } from "@/components/admin/admin-reports-panel";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import {
  listAdminReportAuthorOptions,
  listAdminReportSummaries,
} from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const params = await searchParams;
  const rawUserId = params.userId;
  const selectedUserId =
    typeof rawUserId === "string" && rawUserId.length > 0 ? rawUserId : null;

  const [authorOptions, reports, workspaceUsers, passwordStatus] =
    await Promise.all([
      listAdminReportAuthorOptions(),
      listAdminReportSummaries({
        authorId: selectedUserId ?? undefined,
        includeDeleted: true,
      }),
      listWorkspaceUsers(),
      getPasswordStatusForUser(user.id),
    ]);

  const usersById = Object.fromEntries(
    workspaceUsers.map((entry) => [
      entry.id,
      { name: entry.name, role: entry.role },
    ])
  );

  const shellUsers = workspaceUsers.map(({ id, name, email, role, title }) => ({
    id,
    name,
    email,
    role,
    title,
  }));

  return (
    <AppShell
      user={user}
      initialUsers={shellUsers}
      passwordStatus={passwordStatus}
    >
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", default: "none" }}
        exit={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <AdminReportsPanel
          reports={reports}
          authorOptions={authorOptions}
          selectedUserId={selectedUserId}
          usersById={usersById}
        />
      </ViewTransition>
    </AppShell>
  );
}
