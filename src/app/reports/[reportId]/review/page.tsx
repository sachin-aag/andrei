import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { canViewReport } from "@/lib/reports/access";
import { loadReportAuth } from "@/lib/reports/bundle";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWorkspaceLoader } from "@/components/report/report-workspace-loader";

export const dynamic = "force-dynamic";

export default async function ReviewReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const userPromise = getCurrentUser();
  const { reportId } = await params;
  const reportPromise = loadReportAuth(reportId);
  const usersPromise = listWorkspaceUsers();
  const policyPromise = getPasswordPolicy();
  const user = await userPromise;
  if (!user) redirect("/login");

  const [workspaceUsers, passwordStatus, policy, report] = await Promise.all([
    usersPromise,
    getPasswordStatusForUser(user.id),
    policyPromise,
    reportPromise,
  ]);
  if (!report || !canViewReport(user, report)) notFound();

  const initialTrackChangesMode =
    user.role === "manager" &&
    (report.status === "submitted" || report.status === "in_review");

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <ReportWorkspaceLoader
        reportId={reportId}
        documentType={report.documentType}
        currentUserId={user.id}
        currentUserRole={user.role}
        currentUserEmail={user.email}
        readOnly
        workspaceMode="review"
        initialTrackChangesMode={initialTrackChangesMode}
      />
    </AppShell>
  );
}
