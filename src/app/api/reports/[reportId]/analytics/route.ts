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
  const result = await updateReportAnalytics(
    reportId,
    parsed.data.worksheet!,
    { expectedVersion: parsed.data.version }
  );
  if (result.ok) {
    return NextResponse.json({ analytics: result.analytics });
  }
  if (result.reason === "conflict") {
    return NextResponse.json(
      {
        error: "Worksheet was updated elsewhere.",
        analytics: result.analytics,
      },
      { status: 409 }
    );
  }
  if (result.reason === "invalid") {
    return NextResponse.json({ error: "Invalid worksheet" }, { status: 400 });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Keepalive / sendBeacon from `useAutoSave` posts the same JSON as PATCH. */
export { PATCH as POST };
