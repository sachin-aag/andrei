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
  toolName: string;
};

type ToolResultLike = {
  toolName: string;
  output?: unknown;
  result?: unknown;
};

export type AnalyticsChatStep = {
  toolCalls: readonly ToolCallLike[];
  toolResults?: readonly ToolResultLike[];
};

export type AnalyticsSearchLoopDirective = "continue" | "read";

function toolPayload(result: ToolResultLike): unknown {
  return result.output ?? result.result;
}

function searchHitCount(output: unknown): number {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return 0;
  }
  const record = output as Record<string, unknown>;
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
    if (result.toolName !== SEARCH_TOOL) continue;
    hits += searchHitCount(toolPayload(result));
  }
  return hits;
}

function stepCalledSearch(step: AnalyticsChatStep): boolean {
  return step.toolCalls.some((call) => call.toolName === SEARCH_TOOL);
}

function stepLocatedAttachment(step: AnalyticsChatStep): boolean {
  return step.toolCalls.some((call) => ATTACHMENT_LOCATE_TOOLS.has(call.toolName));
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
}): { activeTools: string[] } | undefined {
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
