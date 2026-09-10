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

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const previewImage =
    record && "previewImage" in record ? record.previewImage : body;
  const matchKey =
    record && typeof record.matchKey === "string" ? record.matchKey : undefined;

  const result = await saveAnalysisPreviewForReport(
    reportId,
    analysisId,
    previewImage as never,
    matchKey
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ analytics: result.analytics });
}
