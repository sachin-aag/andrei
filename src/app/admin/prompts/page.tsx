import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AdminPromptsPanel } from "@/components/admin/admin-prompts-panel";
import { listAdminDocumentPromptCatalogs } from "@/lib/admin/document-prompts";
import { listAdminUsers } from "@/lib/admin/users";
import { getCurrentUser } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/auth/password-policy";

export const dynamic = "force-dynamic";

export default async function AdminPromptsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [users, policy, catalogs] = await Promise.all([
    listAdminUsers(),
    getPasswordPolicy(),
    Promise.resolve(listAdminDocumentPromptCatalogs()),
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
        <AdminPromptsPanel catalogs={catalogs} />
      </ViewTransition>
    </AppShell>
  );
}
