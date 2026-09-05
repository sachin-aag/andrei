import { describe, expect, it } from "vitest";
import { reportProcessingForLinkedAsset } from "./library-link-ingest";

describe("reportProcessingForLinkedAsset", () => {
  it("queues ingest when a ready library file has no ingest run", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: null,
        gcsGeneration: "gen-1",
        processingStatus: "ready",
      })
    ).toEqual({ processingStatus: "queued", shouldStartIngest: true });
  });

  it("copies status when the asset was already ingested", () => {
    expect(
      reportProcessingForLinkedAsset({
        activeIngestRunId: "run-1",
        gcsGeneration: "gen-1",
        processingStatus: "ready",
      })
    ).toEqual({ processingStatus: "ready", shouldStartIngest: false });
  });
});
