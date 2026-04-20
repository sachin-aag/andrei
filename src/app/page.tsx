import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, or } from "drizzle-orm";
import { Plus, FileText, ArrowRight } from "lucide-react";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getUser } from "@/lib/auth/mock-users";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/report/status-badge";
import { CreateReportButton } from "@/components/dashboard/create-report-button";
import { formatDate } from "@/lib/utils";
import type { ReportStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const myReports =
    user.role === "engineer"
      ? await db
          .select()
          .from(reports)
          .where(eq(reports.authorId, user.id))
          .orderBy(desc(reports.updatedAt))
      : await db
          .select()
          .from(reports)
          .where(
            or(
              eq(reports.assignedManagerId, user.id),
              eq(reports.status, "submitted"),
              eq(reports.status, "in_review")
            )
          )
          .orderBy(desc(reports.updatedAt));

  return (
    <AppShell user={user}>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-10 py-6 border-b border-[var(--border)]">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {user.role === "engineer" ? "My Reports" : "Reports Queue"}
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              {user.role === "engineer"
                ? "Create and manage your deviation investigation reports."
                : "Review submitted investigation reports from quality engineers."}
            </p>
          </div>
          {user.role === "engineer" && <CreateReportButton />}
        </div>

        <div className="flex-1 overflow-auto px-10 py-6">
          {myReports.length === 0 ? (
            <EmptyState role={user.role} />
          ) : (
            <div className="grid gap-3">
              {myReports.map((report) => {
                const author = getUser(report.authorId);
                const manager = getUser(report.assignedManagerId ?? undefined);
                return (
                  <Link
                    key={report.id}
                    href={`/reports/${report.id}`}
                    className="group"
                  >
                    <Card className="p-5 hover:border-[var(--brand-500)] transition-colors cursor-pointer">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="size-10 rounded-lg bg-[var(--brand-700)] flex items-center justify-center shrink-0">
                            <FileText className="size-5 text-[var(--brand-200)]" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate">
                                {report.deviationNo || "Untitled deviation"}
                              </h3>
                              <StatusBadge
                                status={report.status as ReportStatus}
                              />
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)] flex flex-wrap items-center gap-3">
                              <span>Date: {formatDate(report.date)}</span>
                              <span>·</span>
                              <span>Author: {author?.name ?? "—"}</span>
                              {manager && (
                                <>
                                  <span>·</span>
                                  <span>Manager: {manager.name}</span>
                                </>
                              )}
                              <span>·</span>
                              <span>
                                Updated: {formatDate(report.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[var(--muted-foreground)] group-hover:text-[var(--brand-300)] transition-colors">
                          <span className="text-xs">Open</span>
                          <ArrowRight className="size-4" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function EmptyState({ role }: { role: "engineer" | "manager" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-16 rounded-2xl bg-[var(--brand-700)] flex items-center justify-center mb-4">
        <FileText className="size-8 text-[var(--brand-200)]" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No reports yet</h3>
      <p className="text-sm text-[var(--muted-foreground)] max-w-md mb-6">
        {role === "engineer"
          ? "Create a new deviation investigation report to get started. Your draft will auto-save as you write."
          : "Reports submitted by engineers will appear here for your review."}
      </p>
      {role === "engineer" && <CreateReportButton />}
    </div>
  );
}
