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
  if (error.message.includes("source changed")) {
    return "Document ingestion was cancelled because the attachment changed";
  }
  if (error.message.includes("deleted")) {
    return "Document ingestion was cancelled because the attachment was deleted";
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

export function isCancelledIngestError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.startsWith("INGEST_CANCELLED:")
  );
}

/**
 * Whether the start-ingest safety net should write a failure row.
 * Skip when markRunTerminal (or ready) already recorded a terminal state.
 */
export function shouldBackfillIngestFailure(row: {
  processingStatus: string;
  processingError: string | null;
}): boolean {
  if (row.processingStatus === "ready") return false;
  if (row.processingStatus === "failed" && row.processingError) return false;
  return true;
}
