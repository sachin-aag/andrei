import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { exportAnalysisImage } from "@/lib/statistical-analysis/export-analysis-image";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";

type RouteContext = {
  params: Promise<{ reportId: string; analysisId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { reportId, analysisId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const specIndex = Number.parseInt(url.searchParams.get("specIndex") ?? "0", 10);

  const analytics = await getOrCreateReportAnalytics(reportId);
  const analysis = analytics.analyses.find((item) => item.id === analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const exported = await exportAnalysisImage(analysis, {
    specIndex: Number.isFinite(specIndex) ? specIndex : 0,
  });
  if ("error" in exported) {
    const status =
      exported.error === "unsupported" || exported.error === "no_chart"
        ? 400
        : 503;
    return NextResponse.json({ error: exported.error }, { status });
  }

  return NextResponse.json({ image: exported });
}
