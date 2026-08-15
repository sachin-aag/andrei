import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadAccessibleReport } from "@/lib/ai/chat/access";
import { findChatSession, loadSessionMessages } from "@/lib/ai/chat/sessions";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reportId: string; sessionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reportId, sessionId } = await params;
  const access = await loadAccessibleReport(reportId, user);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await findChatSession(reportId, sessionId);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await loadSessionMessages(sessionId);
  return NextResponse.json({ messages });
}
