import {
  NoSuchToolError,
  type ToolCallRepairFunction,
  type ToolSet,
} from "ai";

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
 * Recover from `NoSuchToolError` when the model inserts a space or similar
 * into an otherwise valid tool name (e.g. `read_ document_page`).
 * Invalid JSON / schema errors are not rewritten here.
 */
export const repairChatToolCall: ToolCallRepairFunction<ToolSet> = async ({
  toolCall,
  error,
  tools,
}) => {
  if (!NoSuchToolError.isInstance(error)) return null;
  const repaired = resolveRepairedToolName(
    toolCall.toolName,
    Object.keys(tools)
  );
  if (!repaired || repaired === toolCall.toolName) return null;
  console.warn("chat: repaired hallucinated tool name", {
    requested: toolCall.toolName,
    repaired,
  });
  return { ...toolCall, toolName: repaired };
};
