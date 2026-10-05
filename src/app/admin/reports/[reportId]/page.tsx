import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWorkspaceLoader } from "@/components/report/report-workspace-loader";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { loadReportAuth } from "@/lib/reports/bundle";

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
  const [workspaceUsers, passwordStatus, report] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    loadReportAuth(reportId),
  ]);
  if (!report) notFound();

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
    >
      <ReportWorkspaceLoader
        reportId={reportId}
        documentType={report.documentType}
        currentUserId={user.id}
        currentUserRole={user.role}
        currentUserEmail={user.email}
        readOnly
        workspaceMode="view"
      />
    </AppShell>
  );
}
