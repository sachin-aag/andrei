/**
 * How to run PDF extract/embed after finalize.
 * - `workflow` — Vercel Workflow DevKit / Queues (durable; needs healthy World)
 * - `inline` — Next.js `after()` in the finalize request (works when Queues stall)
 *
 * Default: inline on Vercel Preview (queues often leave attachments "queued"),
 * workflow elsewhere. Override with DOCUMENT_INGEST_MODE.
 */
export function resolveDocumentIngestMode(): "inline" | "workflow" {
  const mode = process.env.DOCUMENT_INGEST_MODE?.trim().toLowerCase();
  if (mode === "inline" || mode === "workflow") return mode;
  if (process.env.VERCEL_ENV === "preview") return "inline";
  return "workflow";
}
