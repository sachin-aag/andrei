import { NoSuchToolError, tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  ANALYTICS_WRITE_TOOL_SET,
  DOCUMENT_WRITE_TOOL_SET,
} from "@/lib/ai/chat/user-intent";

/**
 * Internal catch-all. Never advertised (`activeTools` omits it).
 * `repairChatToolCall` remaps a hallucinated name (e.g. `edit_table` on a
 * read/review turn) onto this tool so the AI SDK does not fail the stream.
 */
export const UNSUPPORTED_CHAT_TOOL_NAME = "unsupported_tool";

const WRITE_TOOL_SET = new Set<string>([
  ...DOCUMENT_WRITE_TOOL_SET,
  ...ANALYTICS_WRITE_TOOL_SET,
]);

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
  if (WRITE_TOOL_SET.has(name)) {
    return `${name} is not available this step. If they asked to change the document or worksheet, retry ${name} on the next step — write tools unlock after this signal. Do not paste a markdown table as a stand-in.`;
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

function toolNameOf(record: { toolName?: unknown; tool?: unknown }): string {
  if (typeof record.toolName === "string") return record.toolName;
  if (typeof record.tool === "string") return record.tool;
  return "";
}

function requestedToolFromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("{")) {
      try {
        return requestedToolFromUnknown(JSON.parse(trimmed) as unknown);
      } catch {
        return null;
      }
    }
    return trimmed;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = (value as { requestedTool?: unknown }).requestedTool;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export type WriteUnlockStep = {
  toolCalls?: ReadonlyArray<{
    toolName?: unknown;
    tool?: unknown;
    input?: unknown;
    args?: unknown;
  }>;
  toolResults?: ReadonlyArray<{
    toolName?: unknown;
    tool?: unknown;
    output?: unknown;
    result?: unknown;
  }>;
};

/** True when this turn already tried a hidden write tool (remapped to unsupported_tool). */
export function stepsRequestedHiddenWriteTool(
  steps: readonly WriteUnlockStep[],
  writeTools: ReadonlySet<string>
): boolean {
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      if (toolNameOf(call) !== UNSUPPORTED_CHAT_TOOL_NAME) continue;
      const requested =
        requestedToolFromUnknown(call.input) ??
        requestedToolFromUnknown(call.args);
      if (requested && writeTools.has(requested)) return true;
    }
    for (const result of step.toolResults ?? []) {
      if (toolNameOf(result) !== UNSUPPORTED_CHAT_TOOL_NAME) continue;
      const requested =
        requestedToolFromUnknown(result.output) ??
        requestedToolFromUnknown(result.result);
      if (requested && writeTools.has(requested)) return true;
    }
  }
  return false;
}

export function withUnlockedWriteTools(
  activeTools: readonly string[],
  registeredWriteTools: readonly string[]
): string[] {
  if (registeredWriteTools.length === 0) return [...activeTools];
  const next = new Set(activeTools);
  for (const name of registeredWriteTools) {
    if (name) next.add(name);
  }
  return [...next];
}
