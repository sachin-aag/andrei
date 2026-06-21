import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/report/status-badge";
import { formatCalendarDate, formatDate } from "@/lib/utils";
import type { ReportStatus } from "@/db/schema";

export type ReportCardData = {
  id: string;
  deviationNo: string;
  date: Date;
  status: string;
  authorId: string;
  assignedManagerId: string | null;
  updatedAt: Date;
};

export function ReportCard({
  report,
  href,
  authorName,
  managerName,
  openLabel = "Open",
  titleAction,
  trailingAction,
}: {
  report: ReportCardData;
  href: string;
  authorName: string | undefined;
  managerName: string | undefined;
  openLabel?: string;
  titleAction?: ReactNode;
  trailingAction?: ReactNode;
}) {
  const title = report.deviationNo || "Untitled deviation";

  return (
    <Card className="p-5 transition-colors hover:border-[var(--brand-500)]">
      <div className="group flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Link
            href={href}
            transitionTypes={["nav-forward"]}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-700)]"
          >
            <FileText className="size-5 text-[var(--brand-200)]" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
              <Link
                href={href}
                transitionTypes={["nav-forward"]}
                className="flex min-w-0 items-center gap-2"
              >
                <h3 className="truncate font-semibold">{title}</h3>
                <StatusBadge status={report.status as ReportStatus} />
              </Link>
              {titleAction}
            </div>
            <Link
              href={href}
              transitionTypes={["nav-forward"]}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span>Date: {formatCalendarDate(report.date)}</span>
                <span>·</span>
                <span>Author: {authorName ?? "—"}</span>
                {managerName && (
                  <>
                    <span>·</span>
                    <span>Manager: {managerName}</span>
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
            <Link href={href} transitionTypes={["nav-forward"]}>
              {openLabel}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          {trailingAction}
        </div>
      </div>
    </Card>
  );
}
