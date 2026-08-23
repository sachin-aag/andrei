import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { CHAT_FUNCTION_MAX_DURATION_SEC } from "@/lib/ai/chat/assistant-turn";

export type ChatAssistantTurnStatus = "idle" | "running" | "cancel_requested";

/** How often the client reloads a session that is still generating. */
export const CHAT_TURN_POLL_MS = 1_500;

/**
 * A running row older than the function budget is treated as abandoned so a
 * crashed isolate cannot block the next send forever.
 */
export const CHAT_TURN_STALE_MS =
  CHAT_FUNCTION_MAX_DURATION_SEC * 1_000 + 30_000;

export type ChatSessionTurnState = {
  assistantTurnStatus: ChatAssistantTurnStatus;
  assistantTurnStartedAt: Date | null;
};

export function isChatAssistantTurnActive(
  status: ChatAssistantTurnStatus
): boolean {
  return status === "running" || status === "cancel_requested";
}

export function isAssistantTurnStale(
  startedAt: Date | null,
  now = Date.now()
): boolean {
  if (startedAt == null) return true;
  return now - startedAt.getTime() >= CHAT_TURN_STALE_MS;
}

/**
 * Drain a teed SSE copy so client disconnect does not cancel generation.
 */
export async function drainSseStream(
  stream: ReadableStream<string>
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done) return;
    }
  } catch {
    // The other tee branch errors when the browser drops the response.
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released.
    }
  }
}

export async function loadAssistantTurnState(
  sessionId: string
): Promise<ChatSessionTurnState | null> {
  const [row] = await db
    .select({
      assistantTurnStatus: chatSessions.assistantTurnStatus,
      assistantTurnStartedAt: chatSessions.assistantTurnStartedAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId));
  return row ?? null;
}

export async function isAssistantTurnCancelRequested(
  sessionId: string
): Promise<boolean> {
  const state = await loadAssistantTurnState(sessionId);
  return state?.assistantTurnStatus === "cancel_requested";
}

/**
 * Claim the session for a new assistant turn. Fails when another turn is
 * still running and not stale.
 */
export async function tryMarkAssistantTurnRunning(
  sessionId: string,
  now = new Date()
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - CHAT_TURN_STALE_MS);
  const [row] = await db
    .update(chatSessions)
    .set({
      assistantTurnStatus: "running",
      assistantTurnStartedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        or(
          eq(chatSessions.assistantTurnStatus, "idle"),
          isNull(chatSessions.assistantTurnStartedAt),
          lt(chatSessions.assistantTurnStartedAt, staleBefore)
        )
      )
    )
    .returning({ id: chatSessions.id });
  return Boolean(row);
}

export async function requestAssistantTurnCancel(
  sessionId: string
): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .update(chatSessions)
    .set({
      assistantTurnStatus: "cancel_requested",
      updatedAt: now,
    })
    .where(
      and(
        eq(chatSessions.id, sessionId),
        eq(chatSessions.assistantTurnStatus, "running")
      )
    )
    .returning({ id: chatSessions.id });
  return Boolean(row);
}

export async function clearAssistantTurn(sessionId: string): Promise<void> {
  const now = new Date();
  await db
    .update(chatSessions)
    .set({
      assistantTurnStatus: "idle",
      assistantTurnStartedAt: null,
      updatedAt: now,
    })
    .where(eq(chatSessions.id, sessionId));
}
