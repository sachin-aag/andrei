import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { requestAssistantTurnCancel } from "@/lib/ai/chat/background-turn";
import { findChatSession } from "@/lib/ai/chat/sessions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; sessionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId, sessionId } = await params;
  const access = await loadAccessibleReport(reportId, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await findChatSession(reportId, sessionId, "report");
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const requested = await requestAssistantTurnCancel(sessionId);
  return NextResponse.json({ cancelled: requested });
}
