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
      fileScope: fileScopeSuffix(reviewDocumentsFromParts(parts)),
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
  fileScope: string;
}): string {
  const total = input.totalPages > 0 ? input.totalPages : null;
  const files = input.fileScope;
  switch (input.phase) {
    case "planning":
      return total
        ? `Planning a complete review of ${total} pages${files}…`
        : files
          ? `Planning a complete document review${files}…`
          : "Planning a complete document review…";
    case "reviewing": {
      const pages = total
        ? `Reviewed ${input.reviewedPages}/${total} pages`
        : `Reviewed ${input.reviewedPages} pages`;
      const findings =
        input.findingCount > 0
          ? ` · ${input.findingCount} relevant finding${input.findingCount === 1 ? "" : "s"}`
          : "";
      return `${pages}${files}${findings}`;
    }
    case "finalizing":
      return "Cross-checking citations and duplicates…";
    case "complete":
      return total
        ? `Complete: reviewed ${input.reviewedPages}/${total} pages${files}`
        : `Complete: reviewed ${input.reviewedPages} pages${files}`;
    case "error":
      return "Could not finish the document review.";
    default: {
      const _exhaustive: never = input.phase;
      return _exhaustive;
    }
  }
}

const REVIEW_FILENAME_MAX = 48;

export type ReviewDocumentUiRef = {
  filename: string;
};

/** Filenames from start_document_review (and later tools that echo them). */
export function reviewDocumentsFromParts(
  parts: readonly DocumentReviewToolPart[]
): ReviewDocumentUiRef[] {
  const seen = new Map<string, ReviewDocumentUiRef>();
  for (const part of parts) {
    const raw = part.output?.documents ?? part.input?.documents;
    if (!Array.isArray(raw)) continue;
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      const rec = item as {
        filename?: unknown;
        attachmentId?: unknown;
      };
      const filename =
        typeof rec.filename === "string" ? rec.filename.trim() : "";
      if (!filename) continue;
      const id =
        typeof rec.attachmentId === "string" && rec.attachmentId.trim()
          ? rec.attachmentId
          : filename;
      if (seen.has(id)) continue;
      seen.set(id, { filename });
    }
  }
  return [...seen.values()];
}

export function fileScopeSuffix(docs: readonly ReviewDocumentUiRef[]): string {
  if (docs.length === 0) return "";
  const names = docs.map((doc) => truncateReviewFilename(doc.filename));
  if (names.length === 1) return ` in ${names[0]}`;
  if (names.length === 2) return ` in ${names[0]} and ${names[1]}`;
  return ` in ${names[0]} and ${names.length - 1} more files`;
}

function truncateReviewFilename(name: string): string {
  if (name.length <= REVIEW_FILENAME_MAX) return name;
  return `${name.slice(0, REVIEW_FILENAME_MAX - 1).trimEnd()}…`;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
