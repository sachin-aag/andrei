/** Empty greps before search is hidden for the rest of the turn. */
export const SEARCH_LOOP_EMPTY_LIMIT = 2;

export const DEFAULT_SEARCH_TOOL = "search_documents";

/**
 * Tools that mean a page was located. Once any of these run, further grep is
 * wasted. Includes Analytics locate tools so one directive serves both surfaces.
 */
export const DEFAULT_ATTACHMENT_LOCATE_TOOLS: ReadonlySet<string> = new Set([
  "read_document_page",
  "document_outline",
  "scan_attachments",
  "extract_numeric_series",
]);

export type ToolCallLike = {
  toolName?: string;
  type?: string;
  tool?: string;
};

export type ToolResultLike = {
  toolName?: string;
  type?: string;
  tool?: string;
  output?: unknown;
  result?: unknown;
};

export type SearchLoopStep = {
  toolCalls?: readonly ToolCallLike[];
  toolResults?: readonly ToolResultLike[];
  staticToolCalls?: readonly ToolCallLike[];
  content?: readonly unknown[];
};

export type SearchLoopDirective = "continue" | "read";

export type SearchLoopOptions = {
  searchTool?: string;
  locateTools?: ReadonlySet<string>;
  emptyLimit?: number;
};

export function callToolName(call: ToolCallLike | undefined): string {
  if (!call) return "";
  if (typeof call.toolName === "string" && call.toolName) return call.toolName;
  if (typeof call.tool === "string" && call.tool) return call.tool;
  if (typeof call.type === "string" && call.type.startsWith("tool-")) {
    return call.type.slice("tool-".length);
  }
  return "";
}

export function contentToolName(part: unknown): string {
  if (!part || typeof part !== "object" || Array.isArray(part)) return "";
  const record = part as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "tool-call" || type === "tool-result") {
    return callToolName(record as ToolCallLike);
  }
  if (type.startsWith("tool-")) return type.slice("tool-".length);
  return "";
}

export function collectToolCalls(step: SearchLoopStep): ToolCallLike[] {
  const calls: ToolCallLike[] = [
    ...(step.toolCalls ?? []),
    ...(step.staticToolCalls ?? []),
  ];
  for (const part of step.content ?? []) {
    const name = contentToolName(part);
    if (name) calls.push({ toolName: name });
  }
  return calls;
}

export function unwrapToolPayload(output: unknown): unknown {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }
  const record = output as Record<string, unknown>;
  if (
    record.value !== undefined &&
    (record.type === "json" || record.type === "text")
  ) {
    return unwrapToolPayload(record.value);
  }
  return output;
}

export function toolPayload(result: ToolResultLike): unknown {
  return unwrapToolPayload(result.output ?? result.result);
}

function searchHitCount(output: unknown): number {
  const payload = unwrapToolPayload(output);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return 0;
  }
  const record = payload as Record<string, unknown>;
  const indexHits =
    typeof record.requirementIndexHits === "number"
      ? record.requirementIndexHits
      : 0;
  if (typeof record.returnedCount === "number" && record.returnedCount > 0) {
    // TOC / running-header laundry lists are not a data sheet. Keep search
    // open so the model can grep again (or scan) instead of asking for a page.
    if (indexHits >= record.returnedCount) return 0;
    return record.returnedCount;
  }
  if (Array.isArray(record.seenPages) && record.seenPages.length > 0) {
    return record.seenPages.length;
  }
  if (Array.isArray(record.results) && record.results.length > 0) {
    return record.results.length;
  }
  return 0;
}

export function stepSearchHitCount(
  step: SearchLoopStep,
  searchTool: string
): number {
  let hits = 0;
  for (const result of step.toolResults ?? []) {
    if (callToolName(result) !== searchTool) continue;
    hits += searchHitCount(toolPayload(result));
  }
  for (const part of step.content ?? []) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const record = part as Record<string, unknown>;
    if (contentToolName(part) !== searchTool) continue;
    hits += searchHitCount(
      unwrapToolPayload(record.output ?? record.result)
    );
  }
  return hits;
}

function stepCalledSearch(step: SearchLoopStep, searchTool: string): boolean {
  return collectToolCalls(step).some(
    (call) => callToolName(call) === searchTool
  );
}

function stepLocatedAttachment(
  step: SearchLoopStep,
  locateTools: ReadonlySet<string>
): boolean {
  return collectToolCalls(step).some((call) =>
    locateTools.has(callToolName(call))
  );
}

/**
 * Hide search once a cited page exists, a page was read/scanned/extracted, or
 * `emptyLimit` empty greps have already run. Shared by Document and Analytics
 * chat. `read_section` / `read_worksheet` are not progress.
 */
export function searchLoopDirective(
  steps: readonly SearchLoopStep[],
  options: SearchLoopOptions = {}
): SearchLoopDirective {
  const searchTool = options.searchTool ?? DEFAULT_SEARCH_TOOL;
  const locateTools = options.locateTools ?? DEFAULT_ATTACHMENT_LOCATE_TOOLS;
  const emptyLimit = options.emptyLimit ?? SEARCH_LOOP_EMPTY_LIMIT;

  let emptySearches = 0;
  for (const step of steps) {
    if (
      stepLocatedAttachment(step, locateTools) ||
      stepSearchHitCount(step, searchTool) > 0
    ) {
      return "read";
    }
    if (stepCalledSearch(step, searchTool)) {
      emptySearches += 1;
    }
  }
  return emptySearches >= emptyLimit ? "read" : "continue";
}

/** Drop search from an activeTools list when the loop directive says read. */
export function withoutSearchTool(
  activeTools: readonly string[],
  searchTool: string = DEFAULT_SEARCH_TOOL
): string[] {
  return activeTools.filter((name) => name !== searchTool);
}

