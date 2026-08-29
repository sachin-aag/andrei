import { NextResponse } from "next/server";
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
  return NextResponse.json({ analytics });
}
