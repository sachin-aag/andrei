/**
 * Caps at the chat tool boundary so every step cannot resend unbounded
 * transcripts, excerpts, or findings. Retrieval still applies its own
 * snippet window; this is the last clamp before the model sees the payload.
 */

export const TOOL_RESULT_BUDGET = {
  searchHits: 16,
  searchExcerptChars: 900,
  pageTranscriptChars: 12_000,
  analyticsPageTranscriptChars: 8_000,
  finishFindings: 60,
  finishCitationSummaryChars: 160,
} as const;

export type ToolResultBudgetTextKind =
  | "searchExcerpt"
  | "pageTranscript"
  | "analyticsPageTranscript"
  | "finishSummary";

const TEXT_CAPS: Record<ToolResultBudgetTextKind, number> = {
  searchExcerpt: TOOL_RESULT_BUDGET.searchExcerptChars,
  pageTranscript: TOOL_RESULT_BUDGET.pageTranscriptChars,
  analyticsPageTranscript: TOOL_RESULT_BUDGET.analyticsPageTranscriptChars,
  finishSummary: TOOL_RESULT_BUDGET.finishCitationSummaryChars,
};

export function toolResultBudget(
  kind: ToolResultBudgetTextKind,
  text: string | null | undefined
): string {
  const max = TEXT_CAPS[kind];
  const value = text ?? "";
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function budgetSearchHit<T extends { quote: string; text: string }>(
  hit: T
): T {
  return {
    ...hit,
    quote: toolResultBudget("searchExcerpt", hit.quote),
    text: toolResultBudget("searchExcerpt", hit.text),
  };
}
