import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TemplateGallery } from "@/components/templates/template-gallery";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { managersVisibleInPicker } from "@/lib/reports/hidden-expert-reviewer";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "engineer") redirect("/");

  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);
  const managers = managersVisibleInPicker(workspaceUsers);

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
        exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-[var(--border)] px-10 py-6">
            <h1
              className="text-2xl font-semibold tracking-tight"
              data-walkthrough="create-report"
            >
              Templates
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Pick a document tile to start a draft.
            </p>
          </div>
          <div className="flex-1 overflow-auto px-10 py-6">
            <TemplateGallery managers={managers} />
          </div>
        </div>
      </ViewTransition>
    </AppShell>
  );
}
