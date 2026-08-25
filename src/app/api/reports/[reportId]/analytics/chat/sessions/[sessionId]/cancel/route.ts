import { NextResponse } from "next/server";
import { requireAnalyticsAccess } from "@/lib/statistical-analysis/access";
import { requestAssistantTurnCancel } from "@/lib/ai/chat/background-turn";
import {
  ANALYTICS_CHAT_SURFACE,
  findChatSession,
} from "@/lib/ai/chat/sessions";

type RouteContext = {
  params: Promise<{ reportId: string; sessionId: string }>;
};

export async function POST(_req: Request, context: RouteContext) {
  const { reportId, sessionId } = await context.params;
  const access = await requireAnalyticsAccess(reportId, "view");
  if (!access.ok) return access.response;

  const session = await findChatSession(
    reportId,
    sessionId,
    ANALYTICS_CHAT_SURFACE
  );
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requested = await requestAssistantTurnCancel(sessionId);
  return NextResponse.json({ cancelled: requested });
}
