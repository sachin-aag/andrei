import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentLibrarySection } from "@/components/profile/document-library-section";

export const dynamic = "force-dynamic";

export default async function DocumentLibraryPage() {
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
      <div className="flex h-full flex-col overflow-auto">
        <div className="border-b border-[var(--border)] px-10 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Document library
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Upload files or folders here, or drop them onto a folder. Nested
            folders are kept. A folder must contain only PDF and Word files —
            anything else stops the upload before it starts. Click a file to see
            details. Open a preview when you want to read it. Files already on
            reports stay there if you remove them from the library.
          </p>
        </div>

        <div className="px-10 py-6">
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
