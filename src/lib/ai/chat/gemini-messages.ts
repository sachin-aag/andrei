import type { ModelMessage } from "ai";

/**
 * Gemini only accepts system instructions at the start of the conversation
 * (`systemInstruction`). A `role: "system"` ModelMessage after a user /
 * assistant / tool turn throws:
 * `system messages are only supported at the beginning of the conversation`.
 *
 * Chat keeps the real instructions on streamText's `system` option. Drop any
 * system-role messages in the thread (client-injected or leftover from
 * convertToModelMessages) instead of merging them into that option — untrusted
 * UI text must not become the system prompt.
 */
export function withoutSystemModelMessages<T extends { role: string }>(
  messages: readonly T[]
): T[] {
  if (!messages.some((message) => message.role === "system")) {
    return messages as T[];
  }
  return messages.filter((message) => message.role !== "system");
}

/** Same filter after convertToModelMessages / prepareStep compact. */
export function geminiSafeModelMessages(
  messages: readonly ModelMessage[]
): ModelMessage[] {
  return withoutSystemModelMessages(messages);
}
