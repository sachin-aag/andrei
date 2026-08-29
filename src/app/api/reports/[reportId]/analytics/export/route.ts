import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import {
  analyticsExportFilename,
  buildAnalyticsXlsx,
} from "@/lib/statistical-analysis/export-xlsx";
import { getOrCreateReportAnalytics } from "@/lib/statistical-analysis/store";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ reportId: string }> };

function requestedIncludePlots(req: Request): boolean {
  const value = new URL(req.url).searchParams.get("plots");
  return value === "1" || value === "true";
}

export async function GET(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const analytics = await getOrCreateReportAnalytics(reportId);
  const includePlots = requestedIncludePlots(request);
  const buffer = await buildAnalyticsXlsx(analytics, { includePlots });
  const filename = analyticsExportFilename(access.report.documentNo);

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
