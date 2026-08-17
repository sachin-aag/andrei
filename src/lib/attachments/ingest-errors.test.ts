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

  it("surfaces Google auth failures instead of a generic ingest failed", () => {
    expect(
      sanitizeIngestError(
        new Error("STS exchange failed: 401 {\"error\":\"unauthorized\"}")
      )
    ).toBe(
      "Document ingestion could not authenticate with Google Cloud. Check Vercel OIDC and GCP WIF."
    );
    expect(
      sanitizeIngestError(
        new Error(
          "Vercel OIDC token not available (checked VERCEL_OIDC_TOKEN env and x-vercel-oidc-token header)."
        )
      )
    ).toBe(
      "Document ingestion could not authenticate with Google Cloud. Check Vercel OIDC and GCP WIF."
    );
  });

  it("surfaces Vertex model/region 404s instead of a generic ingest failed", () => {
    expect(
      sanitizeIngestError(
        new Error(
          "Publisher model `projects/andrei-493614/locations/us-central1/publishers/google/models/gemini-3.1-flash-lite` was not found or your project does not have access to it."
        )
      )
    ).toBe(
      "Document ingestion could not reach the Vertex extract model. Gemini 3.x requires location global, not us-central1."
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
