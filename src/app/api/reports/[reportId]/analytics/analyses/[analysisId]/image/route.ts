import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";
import { renderAnalyticsInsertImage } from "@/lib/statistical-analysis/render-analysis-plots";

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
  if (preview) return NextResponse.json({ image: preview });

  // Nobody has opened this plot, so no preview was captured from the DOM.
  // Every kind renders server-side for DOCX export, so render it here rather
  // than telling the engineer to go open it first.
  const rendered = await renderAnalyticsInsertImage(analysis);
  if (!rendered) {
    return NextResponse.json({ error: "not_renderable" }, { status: 404 });
  }

  return NextResponse.json({
    image: {
      dataUrl: rendered.dataUrl,
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
      alt: analysis.title,
      chartSpec: null,
    },
  });
}
