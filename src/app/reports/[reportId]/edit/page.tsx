import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { isHiddenExpertReviewer } from "@/lib/reports/hidden-expert-reviewer";
import { canSaveReportSection, canViewReport } from "@/lib/reports/access";
import { loadReportAuth } from "@/lib/reports/bundle";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWorkspaceLoader } from "@/components/report/report-workspace-loader";

export const dynamic = "force-dynamic";

export default async function EditReportPage({
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

  // Match section PATCH for authors. Managers save via review track-changes, not /edit.
  const canEdit =
    (user.role === "engineer" || isHiddenExpertReviewer(user)) &&
    canSaveReportSection(user, report);

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <ReportWorkspaceLoader
        reportId={reportId}
        currentUserId={user.id}
        currentUserRole={user.role}
        currentUserEmail={user.email}
        readOnly={!canEdit}
        workspaceMode="edit"
      />
    </AppShell>
  );
}
