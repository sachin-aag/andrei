import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import { getCurrentUser } from "@/lib/auth/session";
import { listAdminUsers } from "@/lib/admin/users";
import { getPasswordPolicy } from "@/lib/auth/password-policy";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [users, policy] = await Promise.all([listAdminUsers(), getPasswordPolicy()]);
  const shellUsers = users.map(({ id, name, email, role, title }) => ({
    id,
    name,
    email,
    role,
    title,
  }));

  return (
    <AppShell user={user} initialUsers={shellUsers}>
      <ViewTransition
        enter={{ "nav-forward": "nav-forward", default: "none" }}
        exit={{ "nav-back": "nav-back", default: "none" }}
        default="none"
      >
        <AdminUsersPanel
          initialUsers={users}
          currentUserId={user.id}
          initialPasswordExpiryDays={policy.expiryDays}
        />
      </ViewTransition>
    </AppShell>
  );
}
