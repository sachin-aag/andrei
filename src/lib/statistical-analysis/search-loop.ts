import type { ChatUserIntentKind } from "@/lib/ai/chat/user-intent";
import {
  DEFAULT_ATTACHMENT_LOCATE_TOOLS,
  DEFAULT_SEARCH_TOOL,
  SEARCH_LOOP_EMPTY_LIMIT,
  searchLoopDirective,
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

export function prepareAnalyticsChatStep(input: {
  steps: readonly AnalyticsChatStep[];
  canEdit: boolean;
  searchGate?: AnalyticsSearchGate;
  intent?: ChatUserIntentKind;
}): { activeTools: string[] } | undefined {
  if (input.intent === "social") {
    return { activeTools: [] };
  }
  if (
    input.searchGate &&
    analyticsSearchLoopDirective(input.steps) === "read"
  ) {
    input.searchGate.closed = true;
  }
  if (analyticsSearchLoopDirective(input.steps) !== "read") {
    if (input.intent === "read") {
      return { activeTools: [...READ_AFTER_SEARCH_TOOLS, SEARCH_TOOL] };
    }
    return undefined;
  }
  const activeTools: string[] = [...READ_AFTER_SEARCH_TOOLS];
  if (input.canEdit && input.intent !== "read") {
    activeTools.push(...WRITE_AFTER_SEARCH_TOOLS);
  }
  return { activeTools };
}

// Re-export for callers that strip search from a custom tool list.
export { withoutSearchTool };
