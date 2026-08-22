/**
 * Client-safe document-review progress helpers. Do not import server modules
 * (DB, generateText, retrieval) from this file — chat-panel is a client component.
 */

export const DOCUMENT_REVIEW_TOOL_NAMES = [
  "start_document_review",
  "continue_document_review",
  "finish_document_review",
] as const;

export type DocumentReviewToolName = (typeof DOCUMENT_REVIEW_TOOL_NAMES)[number];

export type DocumentReviewUiPhase =
  | "planning"
  | "reviewing"
  | "finalizing"
  | "complete"
  | "error";

export type DocumentReviewUiSnapshot = {
  phase: DocumentReviewUiPhase;
  totalPages: number;
  reviewedPages: number;
  findingCount: number;
  remainingBatches: number;
  label: string;
  pending: boolean;
};

export type DocumentReviewToolPart = {
  toolName: string;
  state: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
};

const TOOL_NAME_SET = new Set<string>(DOCUMENT_REVIEW_TOOL_NAMES);

export function isDocumentReviewToolName(
  name: string
): name is DocumentReviewToolName {
  return TOOL_NAME_SET.has(name);
}

export function summarizeDocumentReviewProgress(
  parts: readonly DocumentReviewToolPart[]
): DocumentReviewUiSnapshot | null {
  if (parts.length === 0) return null;
  const latest = [...parts].reverse().find((part) => part.output) ?? parts.at(-1);
  if (!latest) return null;

  const output = latest.output ?? {};
  const pending = parts.some(
    (part) =>
      part.state === "input-streaming" ||
      part.state === "input-available" ||
      (part.toolName !== "finish_document_review" && !part.output)
  );

  const totalPages = numberField(output.totalPages) ?? numberField(latest.input?.totalPages) ?? 0;
  const reviewedPages =
    numberField(output.reviewedPages) ?? numberField(output.coveredPages) ?? 0;
  const findingCount = numberField(output.findingCount) ?? 0;
  const remainingBatches = numberField(output.remainingBatches) ?? 0;
  const status = typeof output.status === "string" ? output.status : "";
  const phase = resolvePhase({
    toolName: latest.toolName,
    status,
    pending,
    remainingBatches,
    reviewedPages,
    totalPages,
  });

  return {
    phase,
    totalPages,
    reviewedPages,
    findingCount,
    remainingBatches,
    pending,
    label: labelForSnapshot({
      phase,
      totalPages,
      reviewedPages,
      findingCount,
      pending,
    }),
  };
}

function resolvePhase(input: {
  toolName: string;
  status: string;
  pending: boolean;
  remainingBatches: number;
  reviewedPages: number;
  totalPages: number;
}): DocumentReviewUiPhase {
  if (input.status === "error" || input.status === "no_documents") return "error";
  if (input.toolName === "finish_document_review" && !input.pending) {
    return "complete";
  }
  if (input.status === "complete") return "complete";
  if (
    input.status === "ready_to_finish" ||
    input.toolName === "finish_document_review"
  ) {
    return "finalizing";
  }
  if (input.toolName === "start_document_review" && input.reviewedPages === 0) {
    return "planning";
  }
  if (input.pending && input.reviewedPages === 0) return "planning";
  return "reviewing";
}

function labelForSnapshot(input: {
  phase: DocumentReviewUiPhase;
  totalPages: number;
  reviewedPages: number;
  findingCount: number;
  pending: boolean;
}): string {
  const total = input.totalPages > 0 ? input.totalPages : null;
  switch (input.phase) {
    case "planning":
      return total
        ? `Planning a complete review of ${total} pages…`
        : "Planning a complete document review…";
    case "reviewing": {
      const pages = total
        ? `Reviewed ${input.reviewedPages}/${total} pages`
        : `Reviewed ${input.reviewedPages} pages`;
      const findings =
        input.findingCount > 0
          ? ` · ${input.findingCount} relevant finding${input.findingCount === 1 ? "" : "s"}`
          : "";
      return `${pages}${findings}`;
    }
    case "finalizing":
      return "Cross-checking citations and duplicates…";
    case "complete":
      return total
        ? `Complete: reviewed ${input.reviewedPages}/${total} pages`
        : `Complete: reviewed ${input.reviewedPages} pages`;
    case "error":
      return "Could not finish the document review.";
    default: {
      const _exhaustive: never = input.phase;
      return _exhaustive;
    }
  }
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
