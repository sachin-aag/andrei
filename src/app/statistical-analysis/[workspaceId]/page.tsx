import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { StatisticalWorkspace } from "@/components/statistical-analysis/workspace";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { getWorkspaceForUser } from "@/lib/statistical-analysis/store";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ workspaceId: string }> };

export default async function StatisticalWorkspacePage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStatisticalAnalysisEnabled()) notFound();

  const { workspaceId } = await params;
  const id = decodeURIComponent(workspaceId);
  const workspace = await getWorkspaceForUser(id, user.id);
  if (!workspace) notFound();

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
      <StatisticalWorkspace initial={workspace} />
    </AppShell>
  );
}
