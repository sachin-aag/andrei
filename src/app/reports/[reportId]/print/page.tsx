import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewReport } from "@/lib/reports/access";
import {
  listReportManagerIds,
  withAssignedManagerIds,
} from "@/lib/reports/managers";

export const dynamic = "force-dynamic";

export default async function ReportPrintPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { reportId } = await params;
  const [report] = await db.select().from(reports).where(eq(reports.id, reportId));
  if (!report) redirect("/");

  const managerIds = await listReportManagerIds(reportId);
  const reportWithManagers = withAssignedManagerIds(report, managerIds);
  if (!canViewReport(user, reportWithManagers)) redirect("/");

  return (
    <main className="print-page mx-auto max-w-3xl px-8 py-10 text-sm">
      <div className="no-print mb-6 flex gap-3">
        <Link href={`/reports/${reportId}`} className="underline">
          Back to report
        </Link>
        <a
          href={`/api/reports/${reportId}/complete-export`}
          className="underline"
        >
          Download complete record (ZIP)
        </a>
      </div>
      <h1 className="text-xl font-semibold">Investigation Report Record</h1>
      <p className="mt-2 text-[var(--muted-foreground)]">
        Human-readable print view for 21 CFR Part 11 record retention.
      </p>
      <dl className="mt-8 grid grid-cols-[140px_1fr] gap-y-2">
        <dt className="font-medium">Deviation #</dt>
        <dd>{report.deviationNo}</dd>
        <dt className="font-medium">Status</dt>
        <dd>{report.status}</dd>
        <dt className="font-medium">Report ID</dt>
        <dd className="font-mono text-xs">{report.id}</dd>
        <dt className="font-medium">Created</dt>
        <dd>{report.createdAt.toISOString()}</dd>
        <dt className="font-medium">Updated</dt>
        <dd>{report.updatedAt.toISOString()}</dd>
      </dl>
      <p className="mt-8">
        Use the complete record export for the full audit trail, version history,
        investigation DOCX, and machine-readable metadata bundle.
      </p>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; color: black; }
        }
      `}</style>
    </main>
  );
}
