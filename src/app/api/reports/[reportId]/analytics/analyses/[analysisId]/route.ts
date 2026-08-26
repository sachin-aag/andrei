import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import {
  deleteAnalysisForReport,
  recomputeAnalysisForReport,
} from "@/lib/statistical-analysis/store";

type RouteContext = {
  params: Promise<{ reportId: string; analysisId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { reportId, analysisId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "mutate");
  if (!access.ok) return access.response;

  let action = "recompute";
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action) action = body.action;
  } catch {
    action = "recompute";
  }

  if (action !== "recompute") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const result = await recomputeAnalysisForReport(reportId, analysisId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    analytics: result.analytics,
    analysis: result.analysis,
  });
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
