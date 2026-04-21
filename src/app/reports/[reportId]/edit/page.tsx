import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  reports,
  reportSections,
  criteriaEvaluations,
  comments,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { ReportProvider } from "@/providers/report-provider";
import { ReportWorkspace } from "@/components/report/report-workspace";
import type { ReportBundle } from "@/types/report";

export const dynamic = "force-dynamic";

export default async function EditReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { reportId } = await params;

  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.id, reportId));
  if (!report) notFound();

  const sectionRows = await db
    .select()
    .from(reportSections)
    .where(eq(reportSections.reportId, reportId));

  const evals = await db
    .select()
    .from(criteriaEvaluations)
    .where(eq(criteriaEvaluations.reportId, reportId));

  const commentRows = await db
    .select()
    .from(comments)
    .where(eq(comments.reportId, reportId));

  const canEdit =
    user.role === "engineer" &&
    user.id === report.authorId &&
    report.status !== "approved";

  const bundle = JSON.parse(
    JSON.stringify({
      report,
      sections: sectionRows,
      evaluations: evals,
      comments: commentRows,
    })
  ) as ReportBundle;

  return (
    <AppShell user={user}>
      <ReportProvider
        bundle={bundle}
        currentUserId={user.id}
        readOnly={!canEdit}
      >
        <ReportWorkspace mode="edit" />
      </ReportProvider>
    </AppShell>
  );
}
