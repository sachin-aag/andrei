import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import {
  ANALYTICS_CHAT_SURFACE,
  createChatSession,
  listChatSessions,
} from "@/lib/ai/chat/sessions";

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const sessions = await listChatSessions(reportId, ANALYTICS_CHAT_SURFACE);
  return NextResponse.json({ sessions });
}

export async function POST(_req: Request, context: RouteContext) {
  const { reportId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const session = await createChatSession(reportId, ANALYTICS_CHAT_SURFACE);
  return NextResponse.json({ session });
}
