"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/report/status-badge";
import type { WorkspaceUser } from "@/lib/auth/workspace-user";
import { CreateReportButton } from "@/components/dashboard/create-report-button";
import { DeleteReportButton } from "@/components/dashboard/delete-report-button";
import { EvaluateWithAiButton } from "@/components/dashboard/evaluate-with-ai-button";
import { formatDate } from "@/lib/utils";
import type { ReportStatus } from "@/db/schema";

type DashboardReport = {
  id: string;
  deviationNo: string;
  date: Date;
  status: string;
  authorId: string;
  assignedManagerId: string | null;
  updatedAt: Date;
};

type ManagerOption = Pick<WorkspaceUser, "id" | "name" | "title">;

export function ReportList({
  reports,
  currentUserId,
  userRole,
  usersById,
  managers,
}: {
  reports: DashboardReport[];
  currentUserId: string;
  userRole: "engineer" | "manager";
  usersById: Record<string, { name: string } | undefined>;
  managers: ManagerOption[];
}) {
  const router = useRouter();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());

  const visibleReports = useMemo(
    () => reports.filter((report) => !deletedIds.has(report.id)),
    [reports, deletedIds]
  );

  const handleDeleted = (reportId: string) => {
    setDeletedIds((prev) => new Set(prev).add(reportId));
    router.refresh();
  };

  if (visibleReports.length === 0) {
    return <EmptyState role={userRole} managers={managers} />;
  }

  return (
    <div className="grid gap-3">
      {visibleReports.map((report) => {
        const author = usersById[report.authorId];
        const manager = report.assignedManagerId
          ? usersById[report.assignedManagerId]
          : undefined;
        const canDelete = report.authorId === currentUserId;
        const canEvaluateWithAi = report.authorId === currentUserId;

        return (
          <Card
            key={report.id}
            className="p-5 hover:border-[var(--brand-500)] transition-colors"
          >
            <div className="group flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Link
                  href={`/reports/${report.id}`}
                  transitionTypes={["nav-forward"]}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-700)]"
                >
                  <FileText className="size-5 text-[var(--brand-200)]" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/reports/${report.id}`}
                      transitionTypes={["nav-forward"]}
                      className="flex min-w-0 items-center gap-2"
                    >
                      <h3 className="truncate font-semibold">
                        {report.deviationNo || "Untitled deviation"}
                      </h3>
                      <StatusBadge status={report.status as ReportStatus} />
                    </Link>
                    {canEvaluateWithAi && (
                      <EvaluateWithAiButton
                        layout="inline"
                        reportId={report.id}
                        deviationNo={
                          report.deviationNo || "Untitled deviation"
                        }
                      />
                    )}
                  </div>
                  <Link
                    href={`/reports/${report.id}`}
                    transitionTypes={["nav-forward"]}
                    className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    <div className="flex flex-wrap items-center gap-3">
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
                      <span>Updated: {formatDate(report.updatedAt)}</span>
                    </div>
                  </Link>
                </div>
              </div>
              <div className="flex shrink-0 items-start gap-2 pt-0.5">
                <Button asChild size="sm" className="shrink-0 gap-1.5 shadow-sm">
                  <Link
                    href={`/reports/${report.id}`}
                    transitionTypes={["nav-forward"]}
                  >
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                {canDelete && (
                  <DeleteReportButton
                    reportId={report.id}
                    deviationNo={report.deviationNo || "Untitled deviation"}
                    onDeleted={() => handleDeleted(report.id)}
                  />
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function EmptyState({
  role,
  managers,
}: {
  role: "engineer" | "manager";
  managers: ManagerOption[];
}) {
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
      {role === "engineer" && <CreateReportButton managers={managers} />}
    </div>
  );
}
