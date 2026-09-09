import { redirect } from "next/navigation";
import { ViewTransition } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AdminUsagePanel } from "@/components/admin/admin-usage-panel";
import { listAdminUsers } from "@/lib/admin/users";
import { getCurrentUser } from "@/lib/auth/session";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { getUserActivityReport } from "@/lib/usage/activity";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const [users, policy, report] = await Promise.all([
    listAdminUsers(),
    getPasswordPolicy(),
    getUserActivityReport(),
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
        <AdminUsagePanel initialReport={report} />
      </ViewTransition>
    </AppShell>
  );
}
