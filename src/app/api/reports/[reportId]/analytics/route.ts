import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { patchAnalyticsBodySchema } from "@/lib/statistical-analysis/schemas";
import {
  getOrCreateReportAnalytics,
  updateReportAnalytics,
} from "@/lib/statistical-analysis/store";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const analytics = await getOrCreateReportAnalytics(reportId);
  return NextResponse.json({ analytics });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "mutate");
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchAnalyticsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  await getOrCreateReportAnalytics(reportId);
  const analytics = await updateReportAnalytics(reportId, parsed.data.worksheet!);
  if (!analytics) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ analytics });
}

/** Keepalive / sendBeacon from `useAutoSave` posts the same JSON as PATCH. */
export { PATCH as POST };
