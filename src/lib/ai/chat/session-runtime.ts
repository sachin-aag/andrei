import type { ChatStatus } from "ai";

export function reportChatInstanceId(
  reportId: string,
  sessionId: string
): string {
  return `report-chat-${reportId}-${sessionId}`;
}

export type MountedChatSession = {
  id: string;
  hydrateOnMount: boolean;
};

export function rememberMountedSession(
  current: readonly MountedChatSession[],
  sessionId: string,
  hydrateOnMount: boolean
): MountedChatSession[] {
  if (current.some((session) => session.id === sessionId)) return [...current];
  return [...current, { id: sessionId, hydrateOnMount }];
}

export function isChatTurnBusy(status: ChatStatus): boolean {
  return status === "submitted" || status === "streaming";
}

/** False while a turn is in flight — replacing messages would drop the stream. */
export function canReplaceChatMessages(status: ChatStatus): boolean {
  return !isChatTurnBusy(status);
}

export function rememberBackgroundSession(
  current: readonly string[],
  sessionId: string | null
): string[] {
  if (!sessionId) return [...current];
  if (current.includes(sessionId)) return [...current];
  return [...current, sessionId];
}

export function dropBackgroundSession(
  current: readonly string[],
  sessionId: string
): string[] {
  return current.filter((id) => id !== sessionId);
}

export function runningChatSessionIds(
  backgroundSessionIds: readonly string[],
  currentSessionId: string | null,
  currentBusy: boolean
): ReadonlySet<string> {
  const ids = new Set(backgroundSessionIds);
  if (currentSessionId && currentBusy) ids.add(currentSessionId);
  return ids;
}

