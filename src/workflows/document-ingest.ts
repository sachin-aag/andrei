import { runDocumentIngest } from "@/lib/attachments/run-document-ingest";

/**
 * Durable Workflow entry (Vercel Queues). Prefer this in production when World
 * is healthy. Preview often leaves runs pending — use DOCUMENT_INGEST_MODE=inline.
 *
 * Node I/O (pg, fs, crypto, GCS) must live in a `"use step"` — not the workflow
 * body — or `next build` fails with workflow-node-module-error.
 */
export async function documentIngestWorkflow(
  attachmentId: string,
  generation: string
): Promise<void> {
  "use workflow";
  await documentIngestStep(attachmentId, generation);
}

async function documentIngestStep(
  attachmentId: string,
  generation: string
): Promise<void> {
  "use step";
  await runDocumentIngest(attachmentId, generation);
}
