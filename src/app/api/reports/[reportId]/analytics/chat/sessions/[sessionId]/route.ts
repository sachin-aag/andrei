import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import {
  ANALYTICS_CHAT_SURFACE,
  loadSessionView,
} from "@/lib/ai/chat/sessions";

type RouteContext = {
  params: Promise<{ reportId: string; sessionId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const { reportId, sessionId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const view = await loadSessionView(reportId, sessionId, ANALYTICS_CHAT_SURFACE);
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
}
