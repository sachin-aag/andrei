import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { diffAnalyticsRevisions } from "@/lib/analytics-revisions/diff";
import { loadAnalyticsRevisionPayloads } from "@/lib/analytics-revisions/queries";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const url = new URL(request.url);
  const fromNo = Number(url.searchParams.get("from"));
  const toNo = Number(url.searchParams.get("to"));
  if (!Number.isInteger(fromNo) || !Number.isInteger(toNo) || fromNo === toNo) {
    return NextResponse.json(
      { error: "Pick two different versions." },
      { status: 400 }
    );
  }

  const loaded = await loadAnalyticsRevisionPayloads(reportId, [fromNo, toNo]);
  const from = loaded.find((row) => row.revisionNo === fromNo);
  const to = loaded.find((row) => row.revisionNo === toNo);
  if (!from || !to) {
    return NextResponse.json(
      { error: "Pick two different versions." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    from: fromNo,
    to: toNo,
    diff: diffAnalyticsRevisions(from.payload, to.payload),
  });
}
