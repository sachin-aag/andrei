export const ANALYTICS_CHAT_STEP_BUDGET = 24;
export const ANALYTICS_SEARCH_LOOP_LIMIT = 2;

const SEARCH_TOOL = "search_documents";

/** Page locate — once any of these run, further grep is wasted. */
const ATTACHMENT_LOCATE_TOOLS = new Set([
  "read_document_page",
  "document_outline",
  "scan_attachments",
  "extract_numeric_series",
]);

const READ_AFTER_SEARCH_TOOLS = [
  "read_document_page",
  "document_outline",
  "scan_attachments",
  "ask_user",
  "read_worksheet",
  "extract_numeric_series",
] as const;

const WRITE_AFTER_SEARCH_TOOLS = [
  "write_column",
  "manage_worksheet",
  "run_capability_sixpack",
  "run_one_way_anova",
  "plot_xy_scatter",
  "plot_measurements",
] as const;

type ToolCallLike = {
  toolName?: string;
  type?: string;
  tool?: string;
};

type ToolResultLike = {
  toolName?: string;
  type?: string;
  tool?: string;
  output?: unknown;
  result?: unknown;
};

export type AnalyticsChatStep = {
  toolCalls?: readonly ToolCallLike[];
  toolResults?: readonly ToolResultLike[];
  staticToolCalls?: readonly ToolCallLike[];
  content?: readonly unknown[];
};

export type AnalyticsSearchLoopDirective = "continue" | "read";

/** Per-request latch: once search is closed, execute refuses further greps. */
export type AnalyticsSearchGate = {
  closed: boolean;
};

export function createAnalyticsSearchGate(): AnalyticsSearchGate {
  return { closed: false };
}

function callToolName(call: ToolCallLike | undefined): string {
  if (!call) return "";
  if (typeof call.toolName === "string" && call.toolName) return call.toolName;
  if (typeof call.tool === "string" && call.tool) return call.tool;
  if (typeof call.type === "string" && call.type.startsWith("tool-")) {
    return call.type.slice("tool-".length);
  }
  return "";
}

function contentToolName(part: unknown): string {
  if (!part || typeof part !== "object" || Array.isArray(part)) return "";
  const record = part as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (type === "tool-call" || type === "tool-result") {
    return callToolName(record as ToolCallLike);
  }
  if (type.startsWith("tool-")) return type.slice("tool-".length);
  return "";
}

function collectToolCalls(step: AnalyticsChatStep): ToolCallLike[] {
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

function unwrapToolPayload(output: unknown): unknown {
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

function toolPayload(result: ToolResultLike): unknown {
  return unwrapToolPayload(result.output ?? result.result);
}

function searchHitCount(output: unknown): number {
  const payload = unwrapToolPayload(output);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return 0;
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.returnedCount === "number" && record.returnedCount > 0) {
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

function stepSearchHitCount(step: AnalyticsChatStep): number {
  let hits = 0;
  for (const result of step.toolResults ?? []) {
    if (callToolName(result) !== SEARCH_TOOL) continue;
    hits += searchHitCount(toolPayload(result));
  }
  for (const part of step.content ?? []) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const record = part as Record<string, unknown>;
    if (contentToolName(part) !== SEARCH_TOOL) continue;
    hits += searchHitCount(
      unwrapToolPayload(record.output ?? record.result)
    );
  }
  return hits;
}

function stepCalledSearch(step: AnalyticsChatStep): boolean {
  return collectToolCalls(step).some(
    (call) => callToolName(call) === SEARCH_TOOL
  );
}

function stepLocatedAttachment(step: AnalyticsChatStep): boolean {
  return collectToolCalls(step).some((call) =>
    ATTACHMENT_LOCATE_TOOLS.has(callToolName(call))
  );
}

/**
 * Flash-Lite greps forever on a named table (wrong title, stale chunk
 * filenames). Hide search as soon as a cited page exists, a page was
 * read/scanned/extracted, or two empty greps have already run.
 * `read_worksheet` is not progress — peeking at an empty sheet must not
 * unlock another grep loop.
 */
export function analyticsSearchLoopDirective(
  steps: readonly AnalyticsChatStep[]
): AnalyticsSearchLoopDirective {
  let emptySearches = 0;
  for (const step of steps) {
    if (stepLocatedAttachment(step) || stepSearchHitCount(step) > 0) {
      return "read";
    }
    if (stepCalledSearch(step)) {
      emptySearches += 1;
    }
  }
  return emptySearches >= ANALYTICS_SEARCH_LOOP_LIMIT ? "read" : "continue";
}

export function prepareAnalyticsChatStep(input: {
  steps: readonly AnalyticsChatStep[];
  canEdit: boolean;
  searchGate?: AnalyticsSearchGate;
}): { activeTools: string[] } | undefined {
  if (
    input.searchGate &&
    analyticsSearchLoopDirective(input.steps) === "read"
  ) {
    input.searchGate.closed = true;
  }
  // Last allowed step is text-only so a budget stop is never a silent
  // tool-call dump.
  if (input.steps.length >= ANALYTICS_CHAT_STEP_BUDGET - 1) {
    return { activeTools: [] };
  }
  if (analyticsSearchLoopDirective(input.steps) !== "read") return undefined;
  const activeTools: string[] = [...READ_AFTER_SEARCH_TOOLS];
  if (input.canEdit) {
    activeTools.push(...WRITE_AFTER_SEARCH_TOOLS);
  }
  return { activeTools };
}
