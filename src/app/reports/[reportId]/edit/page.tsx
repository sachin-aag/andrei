import { redirect, notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { isHiddenExpertReviewer } from "@/lib/reports/hidden-expert-reviewer";
import { canSaveReportSection, canViewReport } from "@/lib/reports/access";
import { loadReportBundle } from "@/lib/reports/bundle";
import { AppShell } from "@/components/layout/app-shell";
import { ReportWorkspaceLoading } from "@/components/report/report-workspace-loading";
import { ReportProvider } from "@/providers/report-provider";
import { ReportWorkspace } from "@/components/report/report-workspace";
import type { ReportBundle } from "@/types/report";

export const dynamic = "force-dynamic";

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const userPromise = getCurrentUser();
  const { reportId } = await params;
  const bundlePromise = loadReportBundle(reportId);
  const usersPromise = listWorkspaceUsers();
  const policyPromise = getPasswordPolicy();
  const user = await userPromise;
  if (!user) redirect("/login");

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    usersPromise,
    getPasswordStatusForUser(user.id),
    policyPromise,
  ]);

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <Suspense fallback={<ReportWorkspaceLoading />}>
        <EditReportWorkspace user={user} bundlePromise={bundlePromise} />
      </Suspense>
    </AppShell>
  );
}

async function EditReportWorkspace({
  user,
  bundlePromise,
}: {
  user: WorkspaceUser;
  bundlePromise: Promise<ReportBundle | null>;
}) {
  const bundle = await bundlePromise;
  if (!bundle) notFound();
  if (!canViewReport(user, bundle.report)) notFound();

  // Match section PATCH for authors. Managers save via review track-changes, not /edit.
  const canEdit =
    (user.role === "engineer" || isHiddenExpertReviewer(user)) &&
    canSaveReportSection(user, bundle.report);

  return (
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
  );
}
