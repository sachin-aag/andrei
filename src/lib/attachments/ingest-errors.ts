/**
 * Shared user-facing messages for document ingest failures.
 * Keep free of Next/workflow/db imports so unit tests stay light.
 */

export function sanitizeIngestError(error: unknown): string {
  if (isCancelledIngestError(error)) {
    return "Document ingestion was cancelled because the attachment changed";
  }
  if (!(error instanceof Error)) {
    return "Document ingestion failed";
  }
  if (error.message.includes("GOOGLE_VERTEX_PROJECT")) {
    return "Document ingestion requires Vertex AI credentials";
  }
  if (isGoogleAuthIngestError(error.message)) {
    return "Document ingestion could not authenticate with Google Cloud. Check Vercel OIDC and GCP WIF.";
  }
  if (isVertexModelNotFoundError(error.message)) {
    return "Document ingestion could not reach the Vertex extract model. Gemini 3.x requires location global, not us-central1.";
  }
  if (error.message.includes("source changed")) {
    return "Document ingestion was cancelled because the attachment changed";
  }
  if (error.message.includes("deleted")) {
    return "Document ingestion was cancelled because the attachment was deleted";
  }
  if (isRuntimeTimeoutError(error) || isIngestNeedsContinuation(error)) {
    return "Document ingestion timed out while indexing. Reprocess the attachment to continue.";
  }
  if (
    error.message.includes("PDF") ||
    error.message.includes("embedding") ||
    error.message.includes("extraction")
  ) {
    return error.message.slice(0, 300);
  }
  return "Document ingestion failed";
}

export const INGEST_NEEDS_CONTINUATION = "INGEST_NEEDS_CONTINUATION";
export const INGEST_BATCH_TIMEOUT_MARKER = "INGEST_BATCH_TIMEOUT";

export class IngestNeedsContinuationError extends Error {
  constructor() {
    super(INGEST_NEEDS_CONTINUATION);
    this.name = "IngestNeedsContinuationError";
  }
}

export function isIngestNeedsContinuation(error: unknown): boolean {
  return (
    error instanceof IngestNeedsContinuationError ||
    (error instanceof Error && error.message === INGEST_NEEDS_CONTINUATION)
  );
}

export function isRuntimeTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.message.includes("Vercel Runtime Timeout") ||
    error.message.includes("Task timed out after")
  );
}

function isVertexModelNotFoundError(message: string): boolean {
  return (
    message.includes("Publisher model") ||
    message.includes("was not found or your project does not have access")
  );
}

function isGoogleAuthIngestError(message: string): boolean {
  return (
    message.includes("OIDC") ||
    message.includes("STS exchange") ||
    message.includes("impersonation") ||
    message.includes("Could not load the default credentials") ||
    message.includes("WIF auth request failed") ||
    /unauthorized/i.test(message)
  );
}

export function isCancelledIngestError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("INGEST_CANCELLED:")
  );
}

/**
 * Whether start-ingest safety net should write a failure row.
 * Skip when markRunTerminal (or ready, including ready-with-warning) already
 * recorded a terminal state.
 */
export function shouldBackfillIngestFailure(row: {
  processingStatus: string;
  processingError: string | null;
}): boolean {
  if (row.processingStatus === "ready") return false;
  if (row.processingStatus === "failed" && row.processingError) return false;
  return true;
}

/** Failed ingest, or ready with a page-gap warning, can be retried. */
export function canReprocessAttachment(row: {
  processingStatus: string;
  processingError: string | null;
}): boolean {
  if (row.processingStatus === "failed") return true;
  return row.processingStatus === "ready" && Boolean(row.processingError);
}
