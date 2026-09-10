import { describe, expect, it } from "vitest";
import {
  isVaultIngestHolderMetadata,
  VAULT_INGEST_HOLDER_DOCUMENT_NO,
} from "./vault-ingest-holder";

describe("vault-ingest-holder", () => {
  it("recognizes holder metadata", () => {
    expect(isVaultIngestHolderMetadata({ vaultIngestHolder: true })).toBe(true);
    expect(isVaultIngestHolderMetadata({})).toBe(false);
    expect(isVaultIngestHolderMetadata(null)).toBe(false);
  });

  it("uses a stable reserved document number", () => {
    expect(VAULT_INGEST_HOLDER_DOCUMENT_NO).toBe("__vault_ingest__");
  });
});
