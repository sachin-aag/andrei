import { shouldKeepRtmProtocolSearchOpen } from "@/lib/ai/chat/qsr-row-grounding";
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
  toolCallId?: string;
  input?: unknown;
  args?: unknown;
};

export type ToolResultLike = {
  toolName?: string;
  type?: string;
  tool?: string;
  toolCallId?: string;
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

/**
 * Why search would hide. `cited_or_locate` may stay open on a mixed write
 * while the draft has not landed; `empty_limit` always hides (grep bound).
 */
export type SearchLoopHideKind =
  | "open"
  | "keep_open"
  | "cited_or_locate"
  | "empty_limit";

export type SearchGate = {
  closed: boolean;
};

export function createSearchGate(): SearchGate {
  return { closed: false };
}

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
  const dividerHits =
    typeof record.dividerHits === "number" ? record.dividerHits : 0;
  const identityIncompleteHits =
    typeof record.identityIncompleteHits === "number"
      ? record.identityIncompleteHits
      : 0;
  if (typeof record.returnedCount === "number" && record.returnedCount > 0) {
    // TOC / running-header laundry lists, attachment cover sheets, and
    // title lists without identifier values are not a data page. Keep
    // search open so the model can grep again or read the following page.
    if (indexHits >= record.returnedCount) return 0;
    if (dividerHits >= record.returnedCount) return 0;
    if (identityIncompleteHits >= record.returnedCount) return 0;
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
function searchQueriesFromInput(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const queries: string[] = [];
  if (typeof record.query === "string" && record.query.trim()) {
    queries.push(record.query);
  }
  if (Array.isArray(record.queries)) {
    for (const query of record.queries) {
      if (typeof query === "string" && query.trim()) queries.push(query);
    }
  }
  return queries;
}

function filenamesFromPayload(output: unknown): string[] {
  const payload = unwrapToolPayload(output);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }
  const record = payload as Record<string, unknown>;
  const names: string[] = [];
  if (typeof record.filename === "string" && record.filename.trim()) {
    names.push(record.filename);
  }
  for (const key of ["seenPages", "results"] as const) {
    const rows = record[key];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const filename = (row as { filename?: unknown }).filename;
      if (typeof filename === "string" && filename.trim()) names.push(filename);
    }
  }
  return names;
}

function collectRtmProtocolSearchEvidence(
  steps: readonly SearchLoopStep[],
  searchTool: string
): { queries: string[]; filenames: string[] } {
  const queries: string[] = [];
  const filenames: string[] = [];
  for (const step of steps) {
    for (const call of collectToolCalls(step)) {
      if (callToolName(call) !== searchTool) continue;
      queries.push(...searchQueriesFromInput(call.input ?? call.args));
    }
    for (const result of step.toolResults ?? []) {
      filenames.push(...filenamesFromPayload(toolPayload(result)));
    }
    for (const part of step.content ?? []) {
      if (!part || typeof part !== "object" || Array.isArray(part)) continue;
      const record = part as Record<string, unknown>;
      queries.push(...searchQueriesFromInput(record.input ?? record.args));
      filenames.push(
        ...filenamesFromPayload(unwrapToolPayload(record.output ?? record.result))
      );
    }
  }
  return { queries, filenames };
}

function payloadKeepSearchOpen(output: unknown): boolean {
  const payload = unwrapToolPayload(output);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  if (record.keepSearchOpen === true) return true;
  return record.status === "unsupported_facts";
}

function stepKeepSearchOpen(step: SearchLoopStep): boolean {
  for (const result of step.toolResults ?? []) {
    if (payloadKeepSearchOpen(toolPayload(result))) return true;
  }
  for (const part of step.content ?? []) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const record = part as Record<string, unknown>;
    if (payloadKeepSearchOpen(unwrapToolPayload(record.output ?? record.result))) {
      return true;
    }
  }
  return false;
}

export function searchLoopHideKind(
  steps: readonly SearchLoopStep[],
  options: SearchLoopOptions = {}
): SearchLoopHideKind {
  const searchTool = options.searchTool ?? DEFAULT_SEARCH_TOOL;
  const locateTools = options.locateTools ?? DEFAULT_ATTACHMENT_LOCATE_TOOLS;
  const emptyLimit = options.emptyLimit ?? SEARCH_LOOP_EMPTY_LIMIT;

  if (steps.some((step) => stepKeepSearchOpen(step))) {
    return "keep_open";
  }

  const rtmEvidence = collectRtmProtocolSearchEvidence(steps, searchTool);
  if (
    shouldKeepRtmProtocolSearchOpen(rtmEvidence.queries, rtmEvidence.filenames)
  ) {
    return "keep_open";
  }

  let emptySearches = 0;
  for (const step of steps) {
    if (
      stepLocatedAttachment(step, locateTools) ||
      stepSearchHitCount(step, searchTool) > 0
    ) {
      return "cited_or_locate";
    }
    if (stepCalledSearch(step, searchTool)) {
      emptySearches += 1;
    }
  }
  return emptySearches >= emptyLimit ? "empty_limit" : "open";
}

export function searchLoopDirective(
  steps: readonly SearchLoopStep[],
  options: SearchLoopOptions = {}
): SearchLoopDirective {
  const kind = searchLoopHideKind(steps, options);
  return kind === "open" || kind === "keep_open" ? "continue" : "read";
}

function stepReadDocumentPage(step: SearchLoopStep): boolean {
  return collectToolCalls(step).some(
    (call) => callToolName(call) === "read_document_page"
  );
}

/**
 * After any grep this turn, hide ask_user until a page is actually read.
 * Outline locates; it does not unlock a quiz.
 */
export function documentAskUserDirective(
  steps: readonly SearchLoopStep[]
): "continue" | "hide" {
  let searched = false;
  let readPage = false;
  for (const step of steps) {
    if (stepCalledSearch(step, DEFAULT_SEARCH_TOOL)) searched = true;
    if (stepReadDocumentPage(step)) readPage = true;
  }
  return searched && !readPage ? "hide" : "continue";
}

/** Drop search from an activeTools list when the loop directive says read. */
export function withoutSearchTool(
  activeTools: readonly string[],
  searchTool: string = DEFAULT_SEARCH_TOOL
): string[] {
  return activeTools.filter((name) => name !== searchTool);
}

export function withoutAskUserTool(activeTools: readonly string[]): string[] {
  return activeTools.filter((name) => name !== "ask_user");
}

