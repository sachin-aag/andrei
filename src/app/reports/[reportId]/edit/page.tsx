import { redirect, notFound } from "next/navigation";
import { ViewTransition } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { isHiddenExpertReviewer } from "@/lib/reports/hidden-expert-reviewer";
import { canSaveReportSection, canViewReport } from "@/lib/reports/access";
import { loadReportBundle } from "@/lib/reports/bundle";
import { AppShell } from "@/components/layout/app-shell";
import { ReportProvider } from "@/providers/report-provider";
import { ReportWorkspace } from "@/components/report/report-workspace";

export const dynamic = "force-dynamic";

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { reportId } = await params;

  const bundle = await loadReportBundle(reportId);
  if (!bundle) notFound();
  if (!canViewReport(user, bundle.report)) notFound();

  // Match section PATCH for authors. Managers save via review track-changes, not /edit.
  const canEdit =
    (user.role === "engineer" || isHiddenExpertReviewer(user)) &&
    canSaveReportSection(user, bundle.report);

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <ReportProvider
        bundle={bundle}
        currentUserId={user.id}
        currentUserRole={user.role}
        currentUserEmail={user.email}
        readOnly={!canEdit}
        workspaceMode="edit"
        initialTrackChangesMode={false}
      >
        <ViewTransition
          enter={{ "nav-forward": "nav-forward", default: "none" }}
          exit={{ "nav-back": "nav-back", default: "none" }}
          default="none"
        >
          <ReportWorkspace mode="edit" />
        </ViewTransition>
      </ReportProvider>
    </AppShell>
  );
}
