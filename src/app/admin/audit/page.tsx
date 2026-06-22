import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AdminAuditPanel } from "@/components/admin/admin-audit-panel";

export default async function AdminAuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-[var(--background)] p-6">
      <AdminAuditPanel />
    </div>
  );
}
