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

/** Client hydrate/poll: keep the composer busy while the server is still on the turn. */
export function backgroundTurnFromSessionView(view: {
  assistantTurnStatus: ChatAssistantTurnStatus;
  assistantTurnStartedAt: string | null;
}): { backgroundTurn: boolean; startedAt: number | null } {
  if (!isChatAssistantTurnActive(view.assistantTurnStatus)) {
    return { backgroundTurn: false, startedAt: null };
  }
  return {
    backgroundTurn: true,
    startedAt: view.assistantTurnStartedAt
      ? new Date(view.assistantTurnStartedAt).getTime()
      : null,
  };
}

export function isAssistantTurnStale(
  startedAt: Date | null,
  now = Date.now()
): boolean {
  if (startedAt == null) return true;
  return now - startedAt.getTime() >= CHAT_TURN_STALE_MS;
}
