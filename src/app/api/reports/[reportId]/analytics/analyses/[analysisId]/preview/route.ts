import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { saveAnalysisPreviewForReport } from "@/lib/statistical-analysis/store";

type RouteContext = {
  params: Promise<{ reportId: string; analysisId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId, analysisId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "mutate");
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const previewImage =
    body && typeof body === "object" && "previewImage" in body
      ? (body as { previewImage: unknown }).previewImage
      : body;

  const result = await saveAnalysisPreviewForReport(
    reportId,
    analysisId,
    previewImage as never
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ analytics: result.analytics });
}
