import { NextResponse } from "next/server";
import { auditActorFromUser } from "@/lib/audit";
import { tryRecordAnalyticsChange } from "@/lib/analytics-revisions/record-change";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { createAnalysisForReport } from "@/lib/statistical-analysis/store";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "mutate");
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createAnalysisForReport(reportId, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  await tryRecordAnalyticsChange({
    reportId,
    analytics: result.analytics,
    actor: auditActorFromUser(access.user),
    action: "analysis_created",
    summary: `Created ${result.analysis.title}`,
    entityId: result.analysis.id,
    historySource: "manual",
    historySummary: `Created ${result.analysis.title}`,
  });
  return NextResponse.json(
    { analytics: result.analytics, analysis: result.analysis },
    { status: 201 }
  );
}
