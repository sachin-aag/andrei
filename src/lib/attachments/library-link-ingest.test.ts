import { describe, expect, it } from "vitest";
import { reportProcessingForLinkedAsset } from "./library-link-ingest";

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
