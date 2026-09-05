import { and, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/db";
import { reports, type ReportMetadata } from "@/db/schema";

export const VAULT_INGEST_HOLDER_DOCUMENT_NO = "__vault_ingest__";

export type VaultIngestHolderMetadata = {
  vaultIngestHolder: true;
};

export function isVaultIngestHolderMetadata(
  metadata: ReportMetadata | null | undefined
): metadata is VaultIngestHolderMetadata {
  return (
    metadata != null &&
    typeof metadata === "object" &&
    "vaultIngestHolder" in metadata &&
    metadata.vaultIngestHolder === true
  );
}

/** Exclude hidden vault-ingest holder reports from dashboards and lists. */
export function excludeVaultIngestHolderReportsFilter() {
  return sql`coalesce(${reports.metadata}->>'vaultIngestHolder', 'false') <> 'true'`;
}

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
