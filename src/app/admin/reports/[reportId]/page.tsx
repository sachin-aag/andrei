import { notFound, redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ReportProvider } from "@/providers/report-provider";
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
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
    >
      <ReportProvider
        bundle={bundle}
        currentUserId={user.id}
        readOnly
        workspaceMode="view"
        initialTrackChangesMode={false}
      >
        <ViewTransition
          enter={{ "nav-forward": "nav-forward", default: "none" }}
          exit={{ "nav-back": "nav-back", default: "none" }}
          default="none"
        >
          <ReportWorkspace mode="view" />
        </ViewTransition>
      </ReportProvider>
    </AppShell>
  );
}
