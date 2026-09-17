import { isFileUIPart, type FileUIPart, type UIMessage } from "ai";
import {
  CHAT_AUTO_CONTINUE_TEXT,
  chatUserTurnIsAutoContinue,
} from "@/lib/ai/chat/pending-plan";

export function buildPendingChatUserMessage(input: {
  text: string;
  files?: FileUIPart[];
  metadata?: Record<string, unknown>;
  id?: string;
}): UIMessage {
  const parts: UIMessage["parts"] = [];
  const text = input.text.trim();
  if (text) {
    parts.push({ type: "text", text });
  }
  for (const file of input.files ?? []) {
    parts.push(file);
  }
  return {
    id: input.id ?? `pending-${crypto.randomUUID()}`,
    role: "user",
    parts,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

function userMessageText(message: UIMessage): string {
  return (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function userMessageFileUrls(message: UIMessage): string[] {
  return (message.parts ?? [])
    .filter(
      (part): part is FileUIPart =>
        isFileUIPart(part) && part.mediaType.startsWith("image/")
    )
    .map((part) => part.url);
}

function userTurnsMatch(left: UIMessage, right: UIMessage): boolean {
  if (userMessageText(left) !== userMessageText(right)) return false;
  const leftUrls = userMessageFileUrls(left);
  const rightUrls = userMessageFileUrls(right);
  if (leftUrls.length !== rightUrls.length) return false;
  return leftUrls.every((url, index) => rightUrls[index] === url);
}

function userTurnLooksLikeAutoContinue(message: UIMessage): boolean {
  const metadata =
    "metadata" in message
      ? (message as { metadata?: unknown }).metadata
      : undefined;
  if (chatUserTurnIsAutoContinue(metadata)) return true;
  return userMessageText(message) === CHAT_AUTO_CONTINUE_TEXT;
}

function matchingNonAutoContinueUser(
  messages: readonly UIMessage[],
  pending: UIMessage
): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if (userTurnLooksLikeAutoContinue(message)) continue;
    if (userTurnsMatch(message, pending)) return message;
  }
  return undefined;
}

/** True when `useChat` has already appended this optimistic user turn. */
export function pendingChatUserMessageIsRepresented(
  messages: readonly UIMessage[],
  pending: UIMessage,
  opts?: { allowTextMatch?: boolean }
): boolean {
  if (
    messages.some(
      (message) => message.role === "user" && message.id === pending.id
    )
  ) {
    return true;
  }
  if (!opts?.allowTextMatch) return false;
  return matchingNonAutoContinueUser(messages, pending) != null;
}

/**
 * Hide the optimistic send overlay (and Working…) once the live user row
 * exists, or once this send already streamed and went idle. Remaining-section
 * hydrate replaces the pending UUID; the tab can be done while `pendingSend`
 * still hangs around.
 */
export function shouldShowPendingChatUserOverlay(input: {
  pending: UIMessage | null;
  belongsToSession: boolean;
  messages: readonly UIMessage[];
  busy: boolean;
  pendingRequestStarted: boolean;
  sawStreamBusy: boolean;
}): boolean {
  if (input.pending == null || !input.belongsToSession) return false;
  if (
    pendingChatUserMessageIsRepresented(input.messages, input.pending, {
      allowTextMatch: input.pendingRequestStarted,
    })
  ) {
    return false;
  }
  if (input.pendingRequestStarted && input.sawStreamBusy && !input.busy) {
    return false;
  }
  return true;
}

/** Overlay belongs only to the thread that submitted it. */
export function pendingChatSendBelongsToSession(
  pendingSessionId: string | null,
  currentSessionId: string | null
): boolean {
  return pendingSessionId === currentSessionId;
}

export function mergePendingChatUserMessage(
  messages: readonly UIMessage[],
  pending: UIMessage | null,
  opts?: { allowTextMatch?: boolean }
): UIMessage[] {
  if (!pending) return [...messages];
  if (pendingChatUserMessageIsRepresented(messages, pending, opts)) {
    return [...messages];
  }
  return [...messages, pending];
}
