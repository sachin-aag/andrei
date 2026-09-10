import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AdminLimitsPanel } from "@/components/admin/admin-limits-panel";
import { listAdminUsers } from "@/lib/admin/users";
import { getCurrentUser } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { getAiBudgetStatus } from "@/lib/ai/usage";
import { getAttachmentPageBudgetStatus } from "@/lib/attachments/page-budget";
import { getAttachmentStorageBudgetStatus } from "@/lib/attachments/storage-budget";
import { getVoiceBudgetStatus } from "@/lib/voice/budget";

export const dynamic = "force-dynamic";

export default async function AdminLimitsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [
    users,
    policy,
    aiBudget,
    attachmentPageBudget,
    attachmentStorageBudget,
    voiceBudget,
  ] = await Promise.all([
    listAdminUsers(),
    getPasswordPolicy(),
    getAiBudgetStatus(),
    getAttachmentPageBudgetStatus(),
    getAttachmentStorageBudgetStatus(),
    getVoiceBudgetStatus(),
  ]);
  const shellUsers = users.map(({ id, name, email, role, title }) => ({
    id,
    name,
    email,
    role,
    title,
  }));

  return (
    <AppShell
      user={user}
      initialUsers={shellUsers}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", default: "none" }}
        exit={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <AdminLimitsPanel
          initialAiBudgetStatus={aiBudget}
          initialAttachmentPageBudgetStatus={attachmentPageBudget}
          initialAttachmentStorageBudgetStatus={attachmentStorageBudget}
          initialVoiceBudgetStatus={voiceBudget}
        />
      </ViewTransition>
    </AppShell>
  );
}
