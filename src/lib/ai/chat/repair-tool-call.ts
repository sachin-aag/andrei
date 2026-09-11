import {
  InvalidToolInputError,
  NoSuchToolError,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";
import {
  repairToolInputAgainstSchema,
  type ToolJsonSchema,
} from "@/lib/ai/chat/clamp-tool-input";
import { UNSUPPORTED_CHAT_TOOL_NAME } from "@/lib/ai/chat/unsupported-tool";

const UNSAFE_TOOL_NAME_CHARS = /[^a-zA-Z0-9_-]/g;

/** Strip spaces and other punctuation the model sometimes injects into tool names. */
export function normalizeToolName(requested: string): string {
  return requested.replace(UNSAFE_TOOL_NAME_CHARS, "");
}

/**
 * Map a hallucinated tool name onto exactly one registered tool.
 * Exact match first, then punctuation-stripped, then unique case-insensitive.
 * No substring / fuzzy match — `read` must not become `read_section`.
 */
export function resolveRepairedToolName(
  requested: string,
  available: readonly string[]
): string | null {
  const trimmed = requested.trim();
  if (!trimmed) return null;
  if (available.includes(trimmed)) return trimmed;

  const normalized = normalizeToolName(trimmed);
  if (!normalized) return null;
  if (available.includes(normalized)) return normalized;

  const lower = normalized.toLowerCase();
  const caseMatches = available.filter((name) => name.toLowerCase() === lower);
  if (caseMatches.length === 1) return caseMatches[0]!;
  return null;
}

/**
 * Recover from model slips that would otherwise fail the engineer's turn:
 *
 * - `NoSuchToolError` when a space or similar lands in an otherwise valid tool
 *   name (e.g. `read_ document_page`).
 * - `NoSuchToolError` for a name that is not loaded this turn (e.g. `edit_table`
 *   after write tools were stripped for a question / document-review step).
 *   Remap onto the internal `unsupported_tool` fallback so the stream continues
 *   with a hint instead of `AI_NoSuchToolError`.
 * - `InvalidToolInputError` when the model overshoots the bounds its own JSON
 *   Schema advertises (too many array items, an over-long string, an
 *   out-of-range number, an unknown enum value). The input is clamped to the
 *   schema and retried once. Malformed JSON is not rewritten.
 */
export const repairChatToolCall: ToolCallRepairFunction<ToolSet> = async ({
  toolCall,
  error,
  tools,
  inputSchema,
}) => {
  if (InvalidToolInputError.isInstance(error)) {
    let schema: ToolJsonSchema | undefined;
    try {
      schema = (await inputSchema(toolCall)) as ToolJsonSchema;
    } catch {
      return null;
    }
    const repairedInput = repairToolInputAgainstSchema(toolCall.input, schema);
    if (!repairedInput) return null;
    console.warn("chat: clamped out-of-bounds tool input", {
      toolName: toolCall.toolName,
    });
    return { ...toolCall, input: repairedInput };
  }

  if (!NoSuchToolError.isInstance(error)) return null;
  const available = Object.keys(tools);
  const repaired = resolveRepairedToolName(toolCall.toolName, available);
  if (repaired && repaired !== toolCall.toolName) {
    console.warn("chat: repaired hallucinated tool name", {
      requested: toolCall.toolName,
      repaired,
    });
    return { ...toolCall, toolName: repaired };
  }
  if (
    available.includes(UNSUPPORTED_CHAT_TOOL_NAME) &&
    toolCall.toolName !== UNSUPPORTED_CHAT_TOOL_NAME
  ) {
    console.warn("chat: remapped unavailable tool to fallback", {
      requested: toolCall.toolName,
    });
    return {
      ...toolCall,
      toolName: UNSUPPORTED_CHAT_TOOL_NAME,
      input: JSON.stringify({
        requestedTool: toolCall.toolName.trim().slice(0, 80) || "unknown",
      }),
    };
  }
  return null;
};
