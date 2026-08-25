import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { StatisticalAnalysisListHeader } from "@/components/statistical-analysis/list-header";
import { isStatisticalAnalysisEnabled } from "@/lib/customers/packs";
import { listWorkspacesForUser } from "@/lib/statistical-analysis/store";

export const dynamic = "force-dynamic";

export default async function StatisticalAnalysisListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStatisticalAnalysisEnabled()) notFound();

  const [items, workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspacesForUser(user.id),
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
      <div className="flex h-full flex-col overflow-hidden">
        <StatisticalAnalysisListHeader
          workspaceCount={items.length}
          userName={user.name}
          userEmail={user.email}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No worksheets yet. Use <strong>New worksheet</strong> to enter
              measurements and run a Normal Capability Sixpack.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--secondary)] text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Worksheet</th>
                    <th className="px-4 py-2 font-medium">Analyses</th>
                    <th className="px-4 py-2 font-medium">Updated</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--secondary)]/50"
                    >
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.analysisCount}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {new Date(item.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/statistical-analysis/${encodeURIComponent(item.id)}`}
                          className="font-medium text-[var(--brand-600)] hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
