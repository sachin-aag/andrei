import { NoSuchToolError, tool, type ToolSet } from "ai";
import { z } from "zod";
import { DOCUMENT_WRITE_TOOLS } from "@/lib/ai/chat/user-intent";

/**
 * Internal catch-all. Never advertised (`activeTools` omits it).
 * `repairChatToolCall` remaps a hallucinated name (e.g. `edit_table` on a
 * read/review turn) onto this tool so the AI SDK does not fail the stream.
 */
export const UNSUPPORTED_CHAT_TOOL_NAME = "unsupported_tool";

const DOCUMENT_WRITE_TOOL_SET = new Set<string>(DOCUMENT_WRITE_TOOLS);

export function isUnsupportedChatToolName(name: string): boolean {
  return name === UNSUPPORTED_CHAT_TOOL_NAME;
}

export function advertisedChatToolNames(tools: ToolSet): string[] {
  return Object.keys(tools).filter((name) => !isUnsupportedChatToolName(name));
}

export function withUnsupportedChatToolFallback(tools: ToolSet): ToolSet {
  return {
    ...tools,
    [UNSUPPORTED_CHAT_TOOL_NAME]: unsupportedChatTool(),
  };
}

export function unsupportedChatToolHint(requestedTool: string): string {
  const name = requestedTool.trim() || "that tool";
  if (name === "edit_table" || DOCUMENT_WRITE_TOOL_SET.has(name)) {
    return `${name} is not available this turn. Table and draft tools load only on a write request after any document review has finished. Do not call ${name} again. Continue with a loaded read or review tool, or reply in chat. If they asked to change the document, say so in one line and ask them to confirm.`;
  }
  return `${name} is not available this turn. Use only the tools listed for this step. Do not invent tool names. Continue with a loaded tool, or reply in chat.`;
}

export function unsupportedChatTool() {
  return tool({
    description:
      "Internal fallback for a tool name that is not loaded this turn. Never call this.",
    inputSchema: z.object({
      requestedTool: z.string().max(80),
    }),
    execute: async ({ requestedTool }) => ({
      status: "unavailable" as const,
      requestedTool,
      hint: unsupportedChatToolHint(requestedTool),
    }),
  });
}

const UNAVAILABLE_TOOL_MESSAGE_RE =
  /tried to call unavailable tool '([^']+)'/i;

export function unavailableToolNameFromError(error: unknown): string | null {
  if (NoSuchToolError.isInstance(error)) return error.toolName;
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  const match = message.match(UNAVAILABLE_TOOL_MESSAGE_RE);
  return match?.[1] ?? null;
}

export function isUnavailableToolStreamError(error: unknown): boolean {
  return unavailableToolNameFromError(error) != null;
}
