import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentLibrarySection } from "@/components/profile/document-library-section";

export const dynamic = "force-dynamic";

export default async function DocumentVaultPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

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
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-baseline gap-3 border-b border-[var(--border)] px-6 py-3">
          <h1
            className="text-lg font-semibold tracking-tight"
            data-walkthrough="document-vault"
          >
            Document vault
          </h1>
          <p className="truncate text-sm text-[var(--muted-foreground)]">
            Upload, organize, and share files for reports.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <DocumentLibrarySection
            currentUser={user}
            workspaceUsers={workspaceUsers}
            hideIntro
          />
        </div>
      </div>
    </AppShell>
  );
}
