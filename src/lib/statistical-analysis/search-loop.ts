export const ANALYTICS_CHAT_STEP_BUDGET = 24;
export const ANALYTICS_SEARCH_LOOP_LIMIT = 2;

const SEARCH_TOOL = "search_documents";

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
  "run_capability_sixpack",
  "plot_measurements",
] as const;

const PROGRESS_TOOLS = new Set<string>([
  ...READ_AFTER_SEARCH_TOOLS,
  ...WRITE_AFTER_SEARCH_TOOLS,
]);

type ToolCallLike = {
  toolName: string;
};

export type AnalyticsChatStep = {
  toolCalls: readonly ToolCallLike[];
};

export type AnalyticsSearchLoopDirective = "continue" | "read";

function stepCalledSearchOnly(step: AnalyticsChatStep): boolean {
  const names = step.toolCalls.map((call) => call.toolName);
  if (names.length === 0) return false;
  return names.every((name) => name === SEARCH_TOOL);
}

function stepMadeProgress(step: AnalyticsChatStep): boolean {
  return step.toolCalls.some((call) => PROGRESS_TOOLS.has(call.toolName));
}

/**
 * Flash-Lite will grep forever on a named table (wrong "TABLE NO. 01",
 * stale chunk filenames). After two search-only steps, hide search so
 * the next step must read or extract.
 */
export function analyticsSearchLoopDirective(
  steps: readonly AnalyticsChatStep[]
): AnalyticsSearchLoopDirective {
  let consecutiveSearches = 0;
  for (const step of steps) {
    if (stepMadeProgress(step)) {
      consecutiveSearches = 0;
      continue;
    }
    if (stepCalledSearchOnly(step)) {
      consecutiveSearches += 1;
    }
  }
  return consecutiveSearches >= ANALYTICS_SEARCH_LOOP_LIMIT
    ? "read"
    : "continue";
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
