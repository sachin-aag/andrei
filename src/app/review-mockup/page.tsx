import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { ReviewMockupWorkspace } from "@/components/review-mockup/review-mockup-workspace";

export const dynamic = "force-dynamic";

export default async function ReviewMockupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin/reports");

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
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", default: "none" }}
        exit={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <ReviewMockupWorkspace />
      </ViewTransition>
    </AppShell>
  );
}
