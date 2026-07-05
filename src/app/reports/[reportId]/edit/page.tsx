import { redirect, notFound } from "next/navigation";
import { ViewTransition } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { canViewReport } from "@/lib/reports/access";
import { isReadOnlyRole } from "@/lib/auth/roles";
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

  const canEdit =
    !isReadOnlyRole(user.role) &&
    user.role === "engineer" &&
    user.id === bundle.report.authorId &&
    bundle.report.status !== "approved";

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
