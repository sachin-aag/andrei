import { sql } from "drizzle-orm";
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
