import { MAX_INGEST_CONTINUATIONS } from "@/lib/attachments/ingest-continue-limits";
import {
  failIngestIfStillRunning,
  type IngestRunOutcome,
  runDocumentIngest,
} from "@/lib/attachments/run-document-ingest";

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
  let resume = false;
  for (let slice = 0; slice < MAX_INGEST_CONTINUATIONS; slice += 1) {
    const outcome = await documentIngestStep(attachmentId, generation, resume);
    if (outcome !== "continue") return;
    resume = true;
  }
  await documentIngestGiveUpStep(attachmentId);
}

async function documentIngestStep(
  attachmentId: string,
  generation: string,
  resume: boolean
): Promise<IngestRunOutcome> {
  "use step";
  return runDocumentIngest(attachmentId, generation, { resume });
}

async function documentIngestGiveUpStep(attachmentId: string): Promise<void> {
  "use step";
  await failIngestIfStillRunning(
    attachmentId,
    new Error(
      "Document ingestion could not finish within the time budget. Reprocess the attachment to try again."
    )
  );
}
