import { NextResponse } from "next/server";
import { auditActorFromUser } from "@/lib/audit";
import { tryRecordAnalyticsChange } from "@/lib/analytics-revisions/record-change";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import {
  deleteAnalysisForReport,
  recomputeAnalysisForReport,
  updateAnalysisForReport,
} from "@/lib/statistical-analysis/store";

type RouteContext = {
  params: Promise<{ reportId: string; analysisId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { reportId, analysisId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "mutate");
  if (!access.ok) return access.response;

  let action = "recompute";
  let body: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as {
      action?: string;
      [key: string]: unknown;
    };
    if (parsed.action) action = parsed.action;
    body = parsed;
  } catch {
    action = "recompute";
  }

  if (action === "recompute") {
    const result = await recomputeAnalysisForReport(reportId, analysisId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await tryRecordAnalyticsChange({
      reportId,
      analytics: result.analytics,
      actor: auditActorFromUser(access.user),
      action: "analysis_updated",
      summary: `Recomputed ${result.analysis.title}`,
      entityId: result.analysis.id,
      historySource: "manual",
      historySummary: `Recomputed ${result.analysis.title}`,
    });
    return NextResponse.json({
      analytics: result.analytics,
      analysis: result.analysis,
    });
  }

  if (action === "update") {
    const { action: _action, ...input } = body;
    const result = await updateAnalysisForReport(reportId, analysisId, input);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    await tryRecordAnalyticsChange({
      reportId,
      analytics: result.analytics,
      actor: auditActorFromUser(access.user),
      action: "analysis_updated",
      summary: `Updated ${result.analysis.title}`,
      entityId: result.analysis.id,
      historySource: "manual",
      historySummary: `Updated ${result.analysis.title}`,
    });
    return NextResponse.json({
      analytics: result.analytics,
      analysis: result.analysis,
    });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { reportId, analysisId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "mutate");
  if (!access.ok) return access.response;

  const analytics = await deleteAnalysisForReport(reportId, analysisId);
  if (!analytics) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await tryRecordAnalyticsChange({
    reportId,
    analytics,
    actor: auditActorFromUser(access.user),
    action: "analysis_deleted",
    summary: "Deleted analysis",
    entityId: analysisId,
    historySource: "manual",
    historySummary: "Deleted analysis",
  });
  return NextResponse.json({ analytics });
}
