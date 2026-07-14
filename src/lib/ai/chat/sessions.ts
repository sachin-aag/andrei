import { and, asc, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/db";
import { chatMessages, chatSessions } from "@/db/schema";
import { deriveSessionTitle, UNTITLED_SESSION } from "@/lib/ai/chat/session-title";

export { deriveSessionTitle };

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type PersistedChatMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UIMessage["parts"];
};

const UNTITLED = UNTITLED_SESSION;

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
    title: s.title || UNTITLED,
    updatedAt: s.updatedAt.toISOString(),
    messageCount: counts.get(s.id) ?? 0,
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
    title: UNTITLED,
    updatedAt: created!.updatedAt.toISOString(),
    messageCount: 0,
  };
}

/** Returns the session if it belongs to the report, else null. */
export async function findChatSession(
  reportId: string,
  sessionId: string
): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: chatSessions.id, title: chatSessions.title })
    .from(chatSessions)
    .where(
      and(eq(chatSessions.id, sessionId), eq(chatSessions.reportId, reportId))
    );
  return row ?? null;
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
