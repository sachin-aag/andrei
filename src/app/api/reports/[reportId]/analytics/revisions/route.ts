import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { listAnalyticsRevisions } from "@/lib/analytics-revisions/queries";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const revisions = await listAnalyticsRevisions(reportId);
  return NextResponse.json({
    revisions: revisions.map((row) => ({
      id: row.id,
      revisionNo: row.revisionNo,
      source: row.source,
      summary: row.summary,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdBy: row.createdBy,
    })),
  });
}
