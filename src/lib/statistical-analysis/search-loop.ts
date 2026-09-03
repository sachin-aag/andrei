import type { ChatUserIntentKind } from "@/lib/ai/chat/user-intent";

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
  "plot_boxplot",
  "plot_histogram",
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

const WRITE_COLUMN_TOOL = "write_column";
const MANAGE_WORKSHEET_TOOL = "manage_worksheet";

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
  return (
    record?.status === "written" &&
    typeof record.blankedCount === "number" &&
    record.blankedCount > 0
  );
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
    if (stepSearchHitCount(step) > 0) citedSearch = true;
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

export function prepareAnalyticsChatStep(input: {
  steps: readonly AnalyticsChatStep[];
  canEdit: boolean;
  searchGate?: AnalyticsSearchGate;
  intent?: ChatUserIntentKind;
}): { activeTools: string[] } | undefined {
  if (input.intent === "social") {
    return { activeTools: [] };
  }
  const searchDirective = analyticsSearchLoopDirective(input.steps);
  const writeDirective = analyticsWriteLoopDirective(input.steps);
  const dumpReady = analyticsDumpReadinessDirective(input.steps);
  const manageDirective = analyticsManageLoopDirective(input.steps);
  const partialDump = analyticsPartialDumpDirective(input.steps);
  if (input.searchGate && searchDirective === "read") {
    input.searchGate.closed = true;
  }
  const hideWrite =
    writeDirective === "finish" ||
    dumpReady === "read_first" ||
    partialDump === "read_more";
  const hideManage = manageDirective === "finish";
  const hidden = new Set<string>();
  if (hideWrite) hidden.add(WRITE_COLUMN_TOOL);
  if (hideManage) hidden.add(MANAGE_WORKSHEET_TOOL);

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
      return { activeTools: writableTools(true) };
    }
    return undefined;
  }
  const activeTools: string[] = [...READ_AFTER_SEARCH_TOOLS];
  if (input.canEdit && input.intent !== "read") {
    activeTools.push(...WRITE_AFTER_SEARCH_TOOLS);
  }
  if (hidden.size === 0) {
    return { activeTools };
  }
  return { activeTools: withoutTools(activeTools, hidden) };
}
