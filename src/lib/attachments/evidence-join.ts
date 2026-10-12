import { and, eq, isNotNull, or } from "drizzle-orm";
import {
  documentChunks,
  documentPages,
  reportAttachments,
} from "@/db/schema";

/**
 * Library links share pages/chunks by `assetId`. Eval ingest and legacy
 * report rows have null `assetId` — those still join on `attachmentId`.
 * `NULL = NULL` is unknown in SQL, so an asset-only join returns nothing.
 */
function reportAttachmentEvidenceJoin(
  evidence: typeof documentChunks | typeof documentPages
) {
  const join = or(
    and(
      isNotNull(reportAttachments.assetId),
      isNotNull(evidence.assetId),
      eq(evidence.assetId, reportAttachments.assetId)
    ),
    eq(evidence.attachmentId, reportAttachments.id)
  );
  if (!join) {
    throw new Error("report attachment evidence join is empty");
  }
  return join;
}

export function reportAttachmentChunkJoin() {
  return reportAttachmentEvidenceJoin(documentChunks);
}

export function reportAttachmentPageJoin() {
  return reportAttachmentEvidenceJoin(documentPages);
}
