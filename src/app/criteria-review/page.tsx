import Link from "next/link";
import { redirect } from "next/navigation";
import { humanReviewerFromMockUser } from "@/lib/auth/reviewer-from-user";
import { getCurrentUser } from "@/lib/auth/session";
import { listWorkspaceUsers } from "@/lib/auth/workspace-users";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import { AppShell } from "@/components/layout/app-shell";
import { CriteriaReviewListHeader } from "@/components/criteria-review/criteria-review-list-header";
import { listCriteriaReviewSessions } from "@/lib/criteria-review/store";
import { reviewerProgress } from "@/lib/criteria-review/report-data";

export const dynamic = "force-dynamic";

export default async function CriteriaReviewListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCriteriaReview(user)) redirect("/");

  const items = await listCriteriaReviewSessions();
  const reviewerId = humanReviewerFromMockUser(user).id;
  const workspaceUsers = await listWorkspaceUsers();

  return (
    <AppShell user={user} initialUsers={workspaceUsers}>
      <div className="flex flex-col h-full overflow-hidden">
        <CriteriaReviewListHeader
          reportCount={items.length}
          reviewerName={user.name}
          reviewerEmail={user.email}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              No review reports in the database yet. Run{" "}
              <code className="text-xs">pnpm run seed-criteria-review</code>{" "}
              (uses <code className="text-xs">DATABASE_URL</code> from{" "}
              <code className="text-xs">.env.local</code>, same as{" "}
              <code className="text-xs">next dev</code>).
            </p>
          )}

          {items.length > 0 && (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--secondary)] text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Deviation</th>
                    <th className="px-4 py-2 font-medium">Sections</th>
                    <th className="px-4 py-2 font-medium">Progress</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const { answered, total, status } = reviewerProgress(
                      item,
                      reviewerId
                    );
                    return (
                      <tr
                        key={item.id}
                        className="border-t border-[var(--border)] hover:bg-[var(--secondary)]/50"
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.input.deviationNo}</div>
                          <div className="text-xs text-[var(--muted-foreground)] truncate max-w-xs">
                            {item.input.sourceFile}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.input.sections.length}
                        </td>
                        <td className="px-4 py-3">
                          {answered}/{total}
                        </td>
                        <td className="px-4 py-3 capitalize">
                          {status.replace(/_/g, " ")}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/criteria-review/${encodeURIComponent(item.id)}`}
                            className="text-[var(--brand-600)] hover:underline font-medium"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
