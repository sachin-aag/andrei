import { and, asc, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db";
import { chatMessages, chatSessions } from "@/db/schema";
import type { ChatAssistantTurnStatus } from "@/lib/ai/chat/background-turn";
import { deriveSessionTitle, UNTITLED_SESSION } from "@/lib/ai/chat/session-title";

export { deriveSessionTitle };

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  assistantTurnStatus: ChatAssistantTurnStatus;
  assistantTurnStartedAt: string | null;
};

export type PersistedChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UIMessage["parts"];
};

export async function listChatSessions(
  reportId: string
): Promise<ChatSessionSummary[]> {
  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.reportId, reportId))
    .orderBy(desc(chatSessions.updatedAt));

  const rows = await db
    .select({ sessionId: chatMessages.sessionId })
    .from(chatMessages)
    .where(eq(chatMessages.reportId, reportId));

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.sessionId) continue;
    counts.set(row.sessionId, (counts.get(row.sessionId) ?? 0) + 1);
  }

  return sessions.map((s) => ({
    id: s.id,
    title: s.title || UNTITLED_SESSION,
    updatedAt: s.updatedAt.toISOString(),
    messageCount: counts.get(s.id) ?? 0,
    assistantTurnStatus: s.assistantTurnStatus,
    assistantTurnStartedAt: s.assistantTurnStartedAt?.toISOString() ?? null,
  }));
}

export async function createChatSession(
  reportId: string
): Promise<ChatSessionSummary> {
  const [created] = await db
    .insert(chatSessions)
    .values({ reportId, title: "" })
    .returning();
  return {
    id: created!.id,
    title: UNTITLED_SESSION,
    updatedAt: created!.updatedAt.toISOString(),
    messageCount: 0,
    assistantTurnStatus: created!.assistantTurnStatus,
    assistantTurnStartedAt:
      created!.assistantTurnStartedAt?.toISOString() ?? null,
  };
}

/** Returns the session if it belongs to the report, else null. */
export async function findChatSession(
  reportId: string,
  sessionId: string
): Promise<{
  id: string;
  title: string;
  assistantTurnStatus: ChatAssistantTurnStatus;
  assistantTurnStartedAt: Date | null;
} | null> {
  const [row] = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      assistantTurnStatus: chatSessions.assistantTurnStatus,
      assistantTurnStartedAt: chatSessions.assistantTurnStartedAt,
    })
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.reportId, reportId))
    );
  return row ?? null;
}

export type ChatSessionView = {
  messages: PersistedChatMessage[];
  assistantTurnStatus: ChatAssistantTurnStatus;
  assistantTurnStartedAt: string | null;
};

export async function loadSessionView(
  reportId: string,
  sessionId: string
): Promise<ChatSessionView | null> {
  const session = await findChatSession(reportId, sessionId);
  if (!session) return null;
  const messages = await loadSessionMessages(sessionId);
  return {
    messages,
    assistantTurnStatus: session.assistantTurnStatus,
    assistantTurnStartedAt: session.assistantTurnStartedAt?.toISOString() ?? null,
  };
}

export async function loadSessionMessages(
  sessionId: string
): Promise<PersistedChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(asc(chatMessages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    parts: (row.parts as UIMessage["parts"]) ?? [],
  }));
}

/** Bump updatedAt and set a title from the first user message when still blank. */
export async function touchChatSession(
  sessionId: string,
  firstUserText: string | null
): Promise<void> {
  const [existing] = await db
    .select({ title: chatSessions.title })
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId));
  if (!existing) return;

  const nextTitle =
    !existing.title && firstUserText ? deriveSessionTitle(firstUserText) : undefined;

  await db
    .update(chatSessions)
    .set({ updatedAt: new Date(), ...(nextTitle ? { title: nextTitle } : {}) })
    .where(eq(chatSessions.id, sessionId));
}
