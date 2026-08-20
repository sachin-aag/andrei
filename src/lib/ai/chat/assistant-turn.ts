import type { UIMessage } from "ai";

/** User-facing copy when a chat turn fails or the model returns nothing visible. */
export const CHAT_ASSISTANT_ERROR_MESSAGE =
  "The assistant hit an error. Please try again.";

type ChatTurnPart = {
  type?: string;
  text?: unknown;
};

/**
 * True when the assistant turn would render something in the chat panel.
 * Reasoning / step markers are not shown (`sendReasoning: false`), so a
 * thought-only Gemini reply looks empty to the user.
 */
export function assistantPartsHaveVisibleContent(
  parts: readonly ChatTurnPart[] | null | undefined
): boolean {
  if (!parts || parts.length === 0) return false;
  for (const part of parts) {
    if (!part || typeof part.type !== "string") continue;
    if (part.type === "text") {
      if (typeof part.text === "string" && part.text.trim()) return true;
      continue;
    }
    if (part.type === "file" || part.type.startsWith("tool-")) return true;
  }
  return false;
}

/** Finish reasons that mean the model did not complete a usable reply. */
export function isFailedChatFinishReason(
  finishReason: string | undefined
): boolean {
  return finishReason === "error" || finishReason === "content-filter";
}

export function shouldShowEmptyAssistantError(options: {
  parts: readonly ChatTurnPart[] | null | undefined;
  streaming: boolean;
}): boolean {
  if (options.streaming) return false;
  return !assistantPartsHaveVisibleContent(options.parts);
}

/**
 * Persist a fallback error line when the stream finished with nothing the
 * user can see. Skip aborted streams — the client already dropped the turn.
 */
export function partsForPersistedAssistantTurn(options: {
  parts: UIMessage["parts"] | undefined;
  isAborted: boolean;
}): { parts: UIMessage["parts"]; emptyFailure: boolean } {
  const parts = options.parts ?? [];
  if (options.isAborted || assistantPartsHaveVisibleContent(parts)) {
    return { parts, emptyFailure: false };
  }
  return { parts: EMPTY_ASSISTANT_ERROR_PARTS, emptyFailure: true };
}

export function formatChatLlmError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name?.trim() || "Error";
    const message = error.message?.trim() || "unknown error";
    return `${name}: ${message}`;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

const EMPTY_ASSISTANT_ERROR_PARTS: UIMessage["parts"] = [
  { type: "text", text: CHAT_ASSISTANT_ERROR_MESSAGE },
];
