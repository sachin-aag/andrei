import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";

type RouteContext = {
  params: Promise<{ reportId: string; analysisId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { reportId, analysisId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const analytics = await getOrCreateReportAnalytics(reportId);
  const analysis = analytics.analyses.find((item) => item.id === analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const preview = analysis.previewImage;
  if (!preview) {
    return NextResponse.json({ error: "no_preview" }, { status: 404 });
  }

  return NextResponse.json({ image: preview });
}
