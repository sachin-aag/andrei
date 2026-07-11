import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { withTransientRetry } from "@/lib/db/with-transient-retry";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { getPasswordStatusForUser } from "@/lib/auth/password-status";
import { getPasswordPolicy } from "@/lib/auth/password-policy";
import { AppShell } from "@/components/layout/app-shell";
import { ImproveAiListHeader } from "@/components/improve-ai/improve-ai-list-header";
import { listImproveAiSessionsForUser } from "@/lib/improve-ai/store";
import { getImproveAiSessionView } from "@/lib/improve-ai/store";
import { improveAiReviewProgress } from "@/lib/improve-ai/session-view";

export const dynamic = "force-dynamic";

function statusLabel(status: string): string {
  switch (status) {
    case "evaluating":
      return "Evaluating";
    case "ready_for_review":
      return "Ready for review";
    case "reviewed":
      return "Reviewed";
    default:
      return status;
  }
}

export default async function ImproveAiListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const items = await listImproveAiSessionsForUser(user.id);
  const [workspaceUsers, passwordStatus, policy] = await Promise.all([
    listWorkspaceUsers(),
    getPasswordStatusForUser(user.id),
    getPasswordPolicy(),
  ]);

  const authorReports = await withTransientRetry("improveAi.authorReports", () =>
    db
      .select({
        id: reports.id,
        deviationNo: reports.deviationNo,
      })
      .from(reports)
      .where(eq(reports.authorId, user.id))
      .orderBy(desc(reports.updatedAt))
  );

  const rows = await Promise.all(
    items.map(async (item) => {
      const view = await getImproveAiSessionView(item.id, user.id);
      const progress = view
        ? improveAiReviewProgress(view)
        : { answered: 0, total: 0 };
      return { ...item, ...progress };
    })
  );

  return (
    <AppShell
      user={user}
      initialUsers={workspaceUsers}
      passwordStatus={passwordStatus}
      inactivityTimeoutMinutes={policy.inactivityTimeoutMinutes}
    >
      <div className="flex flex-col h-full overflow-hidden">
        <ImproveAiListHeader
          sessionCount={items.length}
          userName={user.name}
          userEmail={user.email}
          reports={authorReports.map((report) => ({
            id: report.id,
            deviationNo: report.deviationNo || "Untitled deviation",
          }))}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {rows.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              No AI feedback sessions yet. Use <strong>Evaluate report</strong> to
              pick an existing report, or use <strong>Improve AI</strong> on a
              report card from your dashboard.
            </p>
          )}

          {rows.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--secondary)] text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Deviation</th>
                    <th className="px-4 py-2 font-medium">Source</th>
                    <th className="px-4 py-2 font-medium">Progress</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--secondary)]/50"
                    >
                      <td className="px-4 py-3 font-medium">{item.deviationNo}</td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)] truncate max-w-xs">
                        {item.sourceLabel}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {item.answered}/{item.total}
                      </td>
                      <td className="px-4 py-3">{statusLabel(item.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/improve-ai/${encodeURIComponent(item.id)}`}
                          className="text-[var(--brand-600)] hover:underline font-medium"
                        >
                          {item.status === "evaluating" ? "View" : "Review"}
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
