import { describe, expect, it } from "vitest";
import { STALE_INGEST_MESSAGE } from "./stale-ingest-policy";
import {
  linkedVaultDtoNeedsIngest,
  reportProcessingForLinkedAsset,
  resolveVaultIngestHolderLink,
} from "./library-link-ingest";

describe("reportProcessingForLinkedAsset", () => {
  it("reuses a completed vault ingest without starting another", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: "run-1",
        gcsGeneration: "gen-1",
        processingStatus: "ready",
      })
    ).toEqual({ processingStatus: "ready", shouldStartIngest: false });
  });

  it("queues ingest for a ready vault file that was never indexed", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: null,
        gcsGeneration: "gen-1",
        processingStatus: "ready",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: true });
  });

  it("does not start a second ingest while the holder run is in flight", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: "run-1",
        gcsGeneration: "gen-1",
        processingStatus: "processing",
      })
    ).toEqual({ processingStatus: "processing", shouldStartIngest: false });

    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: "run-1",
        gcsGeneration: "gen-1",
        processingStatus: "queued",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: false });
  });

  it("starts ingest for leftover uploading or processing with no run", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: null,
        gcsGeneration: "gen-1",
        processingStatus: "uploading",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: true });

    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: null,
        gcsGeneration: "gen-1",
        processingStatus: "processing",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: true });
  });

  it("restarts a failed vault ingest when the file is added to a report", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: "run-1",
        gcsGeneration: "gen-1",
        processingStatus: "failed",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: true });
  });

  it("still queues ingest when generation is missing so link can recover bytes", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: null,
        gcsGeneration: null,
        processingStatus: "uploading",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: true });
  });
});

describe("linkedVaultDtoNeedsIngest", () => {
  it("kicks leftover uploading and processing rows on the report poll", () => {
    expect(linkedVaultDtoNeedsIngest("uploading")).toBe(true);
    expect(linkedVaultDtoNeedsIngest("processing")).toBe(true);
    expect(linkedVaultDtoNeedsIngest("queued")).toBe(true);
    expect(linkedVaultDtoNeedsIngest("validating")).toBe(true);
  });

  it("does not retry ordinary failures on every poll", () => {
    expect(linkedVaultDtoNeedsIngest("failed")).toBe(false);
    expect(
      linkedVaultDtoNeedsIngest("failed", "Attachment has no finalized source document")
    ).toBe(false);
  });

  it("retries a false stale-cancel so leftover vault files can start", () => {
    expect(linkedVaultDtoNeedsIngest("failed", STALE_INGEST_MESSAGE)).toBe(true);
  });

  it("leaves an indexed vault file alone", () => {
    expect(linkedVaultDtoNeedsIngest("ready")).toBe(false);
  });
});

describe("resolveVaultIngestHolderLink", () => {
  it("inserts when the holder report has no row for the asset", () => {
    expect(resolveVaultIngestHolderLink(null)).toEqual({ action: "insert" });
  });

  it("reuses a live holder attachment", () => {
    expect(
      resolveVaultIngestHolderLink({ id: "att-1", deletedAt: null })
    ).toEqual({ action: "use", id: "att-1" });
  });

  it("restores a tombstoned holder row instead of inserting a duplicate pair", () => {
    expect(
      resolveVaultIngestHolderLink({
        id: "att-1",
        deletedAt: new Date("2026-09-01T00:00:00.000Z"),
      })
    ).toEqual({ action: "restore", id: "att-1" });
  });
});
