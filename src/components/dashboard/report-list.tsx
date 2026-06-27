"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { ReportCard, type ReportCardData } from "@/components/report/report-card";
import { DeleteReportButton } from "@/components/dashboard/delete-report-button";
import { EvaluateWithAiButton } from "@/components/dashboard/evaluate-with-ai-button";

type DashboardReport = ReportCardData;

export function ReportList({
  reports,
  currentUserId,
  userRole,
  usersById,
}: {
  reports: DashboardReport[];
  currentUserId: string;
  userRole: "engineer" | "manager" | "qa";
  usersById: Record<string, { name: string } | undefined>;
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
    return <EmptyState role={userRole} />;
  }

  return (
    <div className="grid gap-3">
      {visibleReports.map((report) => {
        const author = usersById[report.authorId];
        const managerIds =
          report.assignedManagerIds && report.assignedManagerIds.length > 0
            ? report.assignedManagerIds
            : report.assignedManagerId
              ? [report.assignedManagerId]
              : [];
        const managerNames = managerIds
          .map((managerId) => usersById[managerId]?.name)
          .filter((name): name is string => Boolean(name));
        const isOwner = report.authorId === currentUserId;
        const title = report.deviationNo || "Untitled deviation";

        return (
          <ReportCard
            key={report.id}
            report={report}
            href={`/reports/${report.id}`}
            authorName={author?.name}
            managerNames={managerNames}
            titleAction={
              isOwner ? (
                <EvaluateWithAiButton
                  layout="inline"
                  reportId={report.id}
                  deviationNo={title}
                />
              ) : undefined
            }
            trailingAction={
              isOwner ? (
                <DeleteReportButton
                  reportId={report.id}
                  deviationNo={title}
                  onDeleted={() => handleDeleted(report.id)}
                />
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}

function EmptyState({ role }: { role: "engineer" | "manager" | "qa" }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-16 rounded-2xl bg-[var(--brand-700)] flex items-center justify-center mb-4">
        <FileText className="size-8 text-[var(--brand-200)]" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No reports yet</h3>
      <p className="text-sm text-[var(--muted-foreground)] max-w-md">
        {role === "engineer"
          ? "Use New Report above to create your first deviation investigation. Your draft will auto-save as you write."
          : role === "qa"
            ? "No investigation reports are available yet."
            : "Reports submitted by engineers will appear here for your review."}
      </p>
    </div>
  );
}
