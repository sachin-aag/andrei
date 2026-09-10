import { and, eq, isNull } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { reports } from "@/db/schema";
import {
  VAULT_INGEST_HOLDER_DOCUMENT_NO,
  type VaultIngestHolderMetadata,
} from "@/lib/reports/vault-ingest-holder";

/**
 * One hidden report per user anchors vault-only ingest runs. Bytes and ingest
 * state live on attachment_assets; this row exists only to satisfy ingest FKs.
 */
export async function ensureVaultIngestHolderReport(
  ownerId: string
): Promise<string> {
  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.authorId, ownerId),
        eq(reports.documentType, "generic_document"),
        eq(reports.documentNo, VAULT_INGEST_HOLDER_DOCUMENT_NO),
        isNull(reports.deletedAt)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const id = createId();
  await db.insert(reports).values({
    id,
    documentType: "generic_document",
    documentNo: VAULT_INGEST_HOLDER_DOCUMENT_NO,
    authorId: ownerId,
    status: "draft",
    metadata: { vaultIngestHolder: true } satisfies VaultIngestHolderMetadata,
  });
  return id;
}
