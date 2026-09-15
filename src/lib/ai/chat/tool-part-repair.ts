import type { UIMessage } from "ai";

export const INCOMPLETE_TOOL_INTERRUPT_MESSAGE =
  "This tool call was interrupted before it finished.";

type ToolPartRecord = {
  type?: unknown;
  state?: unknown;
  output?: unknown;
  errorText?: unknown;
};

function isToolPart(part: ToolPartRecord): boolean {
  return typeof part.type === "string" && part.type.startsWith("tool-");
}

function isCompleteToolPart(part: ToolPartRecord): boolean {
  const state = part.state;
  if (state === "output-available" || state === "output-error") return true;
  if (part.output != null) return true;
  if (typeof part.errorText === "string" && part.errorText.trim()) return true;
  return false;
}

function closeToolPart<T extends ToolPartRecord>(part: T): T {
  return {
    ...part,
    state: "output-error",
    errorText: INCOMPLETE_TOOL_INTERRUPT_MESSAGE,
    output: { status: "interrupted", reason: "incomplete" },
  };
}

/**
 * `convertToModelMessages` fails the next turn when a persisted tool chip
 * has no result (`Tool result is missing for tool call …`). Cancel / deadline
 * and `tool-calls` stops leave those chips open — close them with an
 * error-shaped result so history stays loadable.
 */
export function closeIncompleteChatToolParts<T extends ToolPartRecord>(
  parts: readonly T[]
): T[] {
  let changed = false;
  const next = parts.map((part) => {
    if (!isToolPart(part) || isCompleteToolPart(part)) return part;
    changed = true;
    return closeToolPart(part);
  });
  return changed ? next : [...parts];
}

export function closeIncompleteChatToolHistory(
  messages: UIMessage[]
): UIMessage[] {
  return messages.map((message) => {
    const parts = message.parts;
    if (!parts || parts.length === 0) return message;
    const nextParts = closeIncompleteChatToolParts(parts);
    const changed = nextParts.some((part, index) => part !== parts[index]);
    if (!changed) return message;
    return { ...message, parts: nextParts };
  });
}
