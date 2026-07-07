import { notFound, redirect } from "next/navigation";
import { ViewTransition } from "react";
import { ReportPageShell } from "@/components/report/report-page-shell";
import { ReportWorkspace } from "@/components/report/report-workspace";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { loadReportBundle } from "@/lib/reports/bundle";

export const dynamic = "force-dynamic";

export default async function AdminReportViewPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const { reportId } = await params;
  const bundle = await loadReportBundle(reportId);
  if (!bundle) notFound();

  const [workspaceUsers, passwordStatus] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
  ]);

  return (
    <ReportPageShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      bundle={bundle}
      currentUserId={user.id}
      userRole={user.role}
      readOnly
      workspaceMode="view"
      initialTrackChangesMode={false}
      backHref="/admin/reports"
      backLabel="Admin Reports"
    >
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", default: "none" }}
        exit={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <ReportWorkspace mode="view" />
      </ViewTransition>
    </ReportPageShell>
  );
}
