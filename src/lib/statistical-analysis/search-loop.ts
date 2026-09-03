import type { ChatUserIntentKind } from "@/lib/ai/chat/user-intent";
import {
  DEFAULT_ATTACHMENT_LOCATE_TOOLS,
  DEFAULT_SEARCH_TOOL,
  SEARCH_LOOP_EMPTY_LIMIT,
  callToolName,
  collectToolCalls,
  contentToolName,
  searchLoopDirective,
  stepSearchHitCount,
  toolPayload,
  unwrapToolPayload,
  withoutSearchTool,
  type SearchLoopDirective,
  type SearchLoopStep,
} from "@/lib/ai/chat/search-loop";

export const ANALYTICS_SEARCH_LOOP_LIMIT = SEARCH_LOOP_EMPTY_LIMIT;

const SEARCH_TOOL = DEFAULT_SEARCH_TOOL;

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
  "plot_boxplot",
  "plot_histogram",
  "plot_measurements",
] as const;

export type AnalyticsChatStep = SearchLoopStep;

export type AnalyticsSearchLoopDirective = SearchLoopDirective;

/** Per-request latch: once search is closed, execute refuses further greps. */
export type AnalyticsSearchGate = {
  closed: boolean;
};

export function createAnalyticsSearchGate(): AnalyticsSearchGate {
  return { closed: false };
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
  return searchLoopDirective(steps, {
    searchTool: SEARCH_TOOL,
    locateTools: DEFAULT_ATTACHMENT_LOCATE_TOOLS,
    emptyLimit: ANALYTICS_SEARCH_LOOP_LIMIT,
  });
}

const WRITE_COLUMN_TOOL = "write_column";
const MANAGE_WORKSHEET_TOOL = "manage_worksheet";
const ASK_USER_TOOL = "ask_user";

/** Page text the model can copy from — outline is not enough to dump. */
const DUMP_SOURCE_TOOLS = new Set([
  "read_document_page",
  "scan_attachments",
  "extract_numeric_series",
]);

function withoutTools(
  tools: readonly string[],
  hidden: ReadonlySet<string>
): string[] {
  return tools.filter((name) => !hidden.has(name));
}

function stepCalledTool(step: AnalyticsChatStep, toolName: string): boolean {
  if (collectToolCalls(step).some((call) => callToolName(call) === toolName)) {
    return true;
  }
  for (const result of step.toolResults ?? []) {
    if (callToolName(result) === toolName) return true;
  }
  return false;
}

function stepReadDumpSource(step: AnalyticsChatStep): boolean {
  if (
    collectToolCalls(step).some((call) =>
      DUMP_SOURCE_TOOLS.has(callToolName(call))
    )
  ) {
    return true;
  }
  for (const result of step.toolResults ?? []) {
    if (DUMP_SOURCE_TOOLS.has(callToolName(result))) return true;
  }
  return false;
}

function writeColumnRecord(output: unknown): Record<string, unknown> | null {
  const payload = unwrapToolPayload(output);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function writeColumnWasEmpty(output: unknown): boolean {
  const record = writeColumnRecord(output);
  return (
    record?.status === "written" &&
    typeof record.rowsWritten === "number" &&
    record.rowsWritten === 0
  );
}

function writeColumnWasIncomplete(output: unknown): boolean {
  const record = writeColumnRecord(output);
  if (!record) return false;
  if (record.status === "incomplete") return true;
  return (
    record.status === "written" &&
    typeof record.blankedCount === "number" &&
    record.blankedCount > 0
  );
}

function dumpSourceHasMorePages(output: unknown, toolName: string): boolean {
  const record = writeColumnRecord(output);
  if (!record) return false;
  if (toolName === "extract_numeric_series") {
    return record.morePages === true;
  }
  if (toolName === "scan_attachments") {
    return record.truncated === true;
  }
  return false;
}

function eachNamedToolOutput(
  step: AnalyticsChatStep,
  toolName: string,
  visit: (output: unknown) => void
) {
  for (const result of step.toolResults ?? []) {
    if (callToolName(result) !== toolName) continue;
    visit(toolPayload(result));
  }
  for (const part of step.content ?? []) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    if (contentToolName(part) !== toolName) continue;
    const record = part as Record<string, unknown>;
    visit(unwrapToolPayload(record.output ?? record.result));
  }
}

function stepDumpSourceHasMorePages(step: AnalyticsChatStep): boolean {
  for (const toolName of DUMP_SOURCE_TOOLS) {
    let more = false;
    eachNamedToolOutput(step, toolName, (output) => {
      if (dumpSourceHasMorePages(output, toolName)) more = true;
    });
    if (more) return true;
  }
  return false;
}

function eachWriteColumnOutput(
  step: AnalyticsChatStep,
  visit: (output: unknown) => void
) {
  for (const result of step.toolResults ?? []) {
    if (callToolName(result) !== WRITE_COLUMN_TOOL) continue;
    visit(toolPayload(result));
  }
  for (const part of step.content ?? []) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    if (contentToolName(part) !== WRITE_COLUMN_TOOL) continue;
    const record = part as Record<string, unknown>;
    visit(unwrapToolPayload(record.output ?? record.result));
  }
}

function stepEmptyWriteColumnCount(step: AnalyticsChatStep): {
  writes: number;
  empty: number;
} {
  let writes = 0;
  let empty = 0;
  eachWriteColumnOutput(step, (output) => {
    writes += 1;
    if (writeColumnWasEmpty(output)) empty += 1;
  });
  return { writes, empty };
}

function stepHadIncompleteWrite(step: AnalyticsChatStep): boolean {
  let incomplete = false;
  eachWriteColumnOutput(step, (output) => {
    if (writeColumnWasIncomplete(output)) incomplete = true;
  });
  return incomplete;
}

/**
 * A blanked dump that the model retries (same rowsWritten 0) used to loop
 * write_column. Two consecutive empty writes hide the tool so it can explain.
 */
export function analyticsWriteLoopDirective(
  steps: readonly AnalyticsChatStep[]
): "continue" | "finish" {
  let consecutiveEmpty = 0;
  for (const step of steps) {
    const { writes, empty } = stepEmptyWriteColumnCount(step);
    if (writes === 0) continue;
    if (empty > 0 && empty === writes) {
      consecutiveEmpty += empty;
    } else {
      consecutiveEmpty = 0;
    }
  }
  return consecutiveEmpty >= 2 ? "finish" : "continue";
}

/**
 * Search snippets are not a table. After a cited-page grep, hide write_column
 * until a page is actually read/scanned/extracted this turn (Quick used to
 * dump invented values from the snippet and stop on a partial extract).
 * document_outline locates pages but does not unlock the dump.
 */
export function analyticsDumpReadinessDirective(
  steps: readonly AnalyticsChatStep[]
): "continue" | "read_first" {
  let citedSearch = false;
  let dumpSource = false;
  for (const step of steps) {
    if (stepSearchHitCount(step, SEARCH_TOOL) > 0) citedSearch = true;
    if (stepReadDumpSource(step)) dumpSource = true;
  }
  return citedSearch && !dumpSource ? "read_first" : "continue";
}

/**
 * One manage_worksheet per turn. Consecutive add_sheet then add_column
 * (before write_column) used empty C# placeholders as guessed high ids.
 * Batch with operations instead.
 */
export function analyticsManageLoopDirective(
  steps: readonly AnalyticsChatStep[]
): "continue" | "finish" {
  return steps.some((step) => stepCalledTool(step, MANAGE_WORKSHEET_TOOL))
    ? "finish"
    : "continue";
}

/**
 * A dump with blanked cells is not done. Hide write_column until the model
 * reads another page so it cannot retry the same invented rows.
 */
export function analyticsPartialDumpDirective(
  steps: readonly AnalyticsChatStep[]
): "continue" | "read_more" {
  let pendingIncomplete = false;
  for (const step of steps) {
    if (pendingIncomplete && stepReadDumpSource(step)) {
      pendingIncomplete = false;
    }
    if (stepHadIncompleteWrite(step)) {
      pendingIncomplete = true;
    }
  }
  return pendingIncomplete ? "read_more" : "continue";
}

/**
 * Keep pulling pages while extract morePages or scan truncated is true.
 * Hide write_column so a first-page dump cannot land.
 */
export function analyticsGatherDirective(
  steps: readonly AnalyticsChatStep[]
): "continue" | "gather" {
  let pendingMore = false;
  for (const step of steps) {
    if (stepDumpSourceHasMorePages(step)) {
      pendingMore = true;
      continue;
    }
    if (pendingMore && stepReadDumpSource(step)) {
      pendingMore = false;
    }
  }
  return pendingMore ? "gather" : "continue";
}

const PLOT_TOOLS = [
  "run_capability_sixpack",
  "run_one_way_anova",
  "plot_xy_scatter",
  "plot_boxplot",
  "plot_histogram",
  "plot_measurements",
] as const;

export type AnalyticsPrepareStep = {
  activeTools: string[];
  toolChoice?: "required";
};

export function prepareAnalyticsChatStep(input: {
  steps: readonly AnalyticsChatStep[];
  canEdit: boolean;
  searchGate?: AnalyticsSearchGate;
  intent?: ChatUserIntentKind;
}): AnalyticsPrepareStep | undefined {
  if (input.intent === "social") {
    return { activeTools: [] };
  }
  const searchDirective = analyticsSearchLoopDirective(input.steps);
  const writeDirective = analyticsWriteLoopDirective(input.steps);
  const dumpReady = analyticsDumpReadinessDirective(input.steps);
  const manageDirective = analyticsManageLoopDirective(input.steps);
  const partialDump = analyticsPartialDumpDirective(input.steps);
  const gather = analyticsGatherDirective(input.steps);
  if (input.searchGate && searchDirective === "read") {
    input.searchGate.closed = true;
  }
  const stillGathering =
    dumpReady === "read_first" ||
    partialDump === "read_more" ||
    gather === "gather";
  const hideWrite =
    writeDirective === "finish" || stillGathering;
  const hideManage = manageDirective === "finish";
  const hideAsk = stillGathering;
  const hidePlots = stillGathering;
  const hidden = new Set<string>();
  if (hideWrite) hidden.add(WRITE_COLUMN_TOOL);
  if (hideManage) hidden.add(MANAGE_WORKSHEET_TOOL);
  // Cited grep is not a missing page — Quick was asking for the page number.
  // A truncated extract is also not a moment to ask — keep reading pages.
  if (hideAsk) hidden.add(ASK_USER_TOOL);
  if (hidePlots) {
    for (const name of PLOT_TOOLS) hidden.add(name);
  }

  const forceContinue =
    input.intent !== "read" &&
    writeDirective !== "finish" &&
    stillGathering;

  const withChoice = (activeTools: string[]): AnalyticsPrepareStep =>
    forceContinue
      ? { activeTools, toolChoice: "required" }
      : { activeTools };

  const writableTools = (searchOpen: boolean): string[] => {
    const tools = [
      ...(searchOpen ? [SEARCH_TOOL] : []),
      ...READ_AFTER_SEARCH_TOOLS,
      ...WRITE_AFTER_SEARCH_TOOLS,
    ];
    return hidden.size > 0 ? withoutTools(tools, hidden) : tools;
  };

  if (searchDirective !== "read") {
    if (input.intent === "read") {
      return { activeTools: [...READ_AFTER_SEARCH_TOOLS, SEARCH_TOOL] };
    }
    if (!input.canEdit) {
      return undefined;
    }
    if (hidden.size > 0) {
      return withChoice(writableTools(true));
    }
    return undefined;
  }
  const activeTools: string[] = [...READ_AFTER_SEARCH_TOOLS];
  if (input.canEdit && input.intent !== "read") {
    activeTools.push(...WRITE_AFTER_SEARCH_TOOLS);
  }
  const next =
    hidden.size === 0 ? activeTools : withoutTools(activeTools, hidden);
  return withChoice(next);
}

// Re-export for callers that strip search from a custom tool list.
export { withoutSearchTool };
