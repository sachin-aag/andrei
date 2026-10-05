import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireReportAccess } from "@/lib/reports/require-report-access";
import { loadReviewRunContext, buildReviewSnapshot } from "@/lib/review/server";
import { observeRouteHandler } from "@/lib/observability/langfuse";

export const GET = observeRouteHandler("report-review-get", handleGet);

async function handleGet(
  _req: Request,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const user = await getCurrentUser();
  const { reportId } = await params;
  const access = await requireReportAccess(reportId, user);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const ctx = await loadReviewRunContext({
    report: access.report,
    user: access.user,
  });
  const snapshot = await buildReviewSnapshot(ctx);
  return NextResponse.json(snapshot);
}
