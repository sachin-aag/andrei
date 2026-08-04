import { describe, expect, it } from "vitest";
import {
  sanitizeIngestError,
  shouldBackfillIngestFailure,
} from "./ingest-errors";

describe("sanitizeIngestError", () => {
  it("keeps actionable Vertex / PDF messages", () => {
    expect(
      sanitizeIngestError(new Error("GOOGLE_VERTEX_PROJECT is required"))
    ).toBe("Document ingestion requires Vertex AI credentials");
    expect(sanitizeIngestError(new Error("PDF page limit exceeded"))).toBe(
      "PDF page limit exceeded"
    );
  });

  it("does not claim ingest 'could not be started'", () => {
    expect(sanitizeIngestError(new Error("boom"))).toBe(
      "Document ingestion failed"
    );
    expect(sanitizeIngestError("nope")).toBe("Document ingestion failed");
  });
});

describe("shouldBackfillIngestFailure", () => {
  it("does not overwrite a real failed message or ready status", () => {
    expect(
      shouldBackfillIngestFailure({
        processingStatus: "failed",
        processingError: "Document ingestion requires Vertex AI credentials",
      })
    ).toBe(false);
    expect(
      shouldBackfillIngestFailure({
        processingStatus: "ready",
        processingError: null,
      })
    ).toBe(false);
  });

  it("backfills when still in-flight or failed without a message", () => {
    expect(
      shouldBackfillIngestFailure({
        processingStatus: "processing",
        processingError: null,
      })
    ).toBe(true);
    expect(
      shouldBackfillIngestFailure({
        processingStatus: "failed",
        processingError: null,
      })
    ).toBe(true);
  });
});
