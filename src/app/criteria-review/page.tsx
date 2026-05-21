import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCriteriaReview } from "@/lib/criteria-review/access";
import { AppShell } from "@/components/layout/app-shell";
import { isLangfuseConfigured, listCriteriaReviewSessions } from "@/lib/langfuse/client";
import {
  CRITERIA_REVIEW_DATASET_NAME,
  sessionProgress,
} from "@/lib/langfuse/criteria-dataset";

export const dynamic = "force-dynamic";

export default async function CriteriaReviewListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCriteriaReview(user)) redirect("/");

  const configured = isLangfuseConfigured();
  const items = configured ? await listCriteriaReviewSessions() : [];

  return (
    <AppShell user={user}>
      <div className="flex flex-col h-full overflow-hidden">
        <header className="shrink-0 border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-[var(--brand-600)]" />
            <h1 className="text-lg font-semibold">Criteria review</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Review AI traffic-light evaluations on sample deviation reports (one
            report per session).
          </p>
          {configured && (
            <p className="text-xs text-[var(--muted-foreground)] mt-2 font-mono">
              Langfuse dataset: {CRITERIA_REVIEW_DATASET_NAME}
              {items.length > 0 ? ` · ${items.length} sessions` : ""}
            </p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {!configured && (
            <p className="text-sm text-amber-700 dark:text-amber-300 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              Langfuse is not configured. Add LANGFUSE_PUBLIC_KEY,
              LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL to .env.local, then run{" "}
              <code className="text-xs">pnpm run seed-criteria-review</code>.
            </p>
          )}

          {configured && items.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              No review sessions in the dataset yet. Run{" "}
              <code className="text-xs">pnpm run seed-criteria-review</code>.
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
                    <th className="px-4 py-2 font-medium">Reviewers</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const { answered, total, status, reviewerCount } =
                      sessionProgress(item);
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
                        <td className="px-4 py-3">
                          {reviewerCount}
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
