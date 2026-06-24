import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { loadReportBundle } from "@/lib/reports/bundle";
import { GuidedFlowWizard } from "@/components/report/guided-flow/guided-flow-wizard";

export const dynamic = "force-dynamic";

export default async function GuidedFlowPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { reportId } = await params;

  const bundle = await loadReportBundle(reportId);
  if (!bundle) notFound();

  const canUseGuidedFlow =
    user.role === "engineer" &&
    user.id === bundle.report.authorId &&
    (bundle.report.status === "draft" || bundle.report.status === "feedback");

  if (!canUseGuidedFlow) {
    redirect(`/reports/${reportId}/edit`);
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <GuidedFlowWizard
        reportId={reportId}
        deviationNo={bundle.report.deviationNo}
      />
    </div>
  );
}
