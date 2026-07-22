import { redirect, notFound } from "next/navigation";
import { ViewTransition } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { loadReportBundle } from "@/lib/reports/bundle";
import { ReportPageShell } from "@/components/report/report-page-shell";
import { ReportWorkspace } from "@/components/report/report-workspace";

export const dynamic = "force-dynamic";

export default async function ReviewReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { reportId } = await params;

  const bundle = await loadReportBundle(reportId);
  if (!bundle) notFound();

  const initialTrackChangesMode =
    user.role === "manager" &&
    (bundle.report.status === "submitted" ||
      bundle.report.status === "in_review");

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);

  return (
    <ReportPageShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
      bundle={bundle}
      currentUserId={user.id}
      userRole={user.role}
      readOnly
      workspaceMode="review"
      initialTrackChangesMode={initialTrackChangesMode}
      backHref="/"
      backLabel="Reports"
    >
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", default: "none" }}
        exit={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <ReportWorkspace mode="review" />
      </ViewTransition>
    </ReportPageShell>
  );
}
