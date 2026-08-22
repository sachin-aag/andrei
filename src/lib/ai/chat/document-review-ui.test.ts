import { describe, expect, it } from "vitest";
import {
  summarizeDocumentReviewProgress,
} from "@/lib/ai/chat/document-review-ui";

describe("summarizeDocumentReviewProgress", () => {
  it("shows planning copy while start is in flight", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "input-available",
        input: { objective: "matrix" },
      },
    ]);
    expect(snapshot?.label).toBe("Planning a complete document review…");
    expect(snapshot?.pending).toBe(true);
  });

  it("names the page count once start reports it", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: { status: "started", totalPages: 62, remainingBatches: 12 },
      },
    ]);
    expect(snapshot?.label).toBe("Planning a complete review of 62 pages…");
  });

  it("shows page and finding counts while continuing", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: { status: "started", totalPages: 62, remainingBatches: 12 },
      },
      {
        toolName: "continue_document_review",
        state: "output-available",
        output: {
          status: "in_progress",
          totalPages: 62,
          reviewedPages: 24,
          findingCount: 18,
        },
      },
    ]);
    expect(snapshot?.label).toBe("Reviewed 24/62 pages · 18 relevant findings");
  });

  it("shows citation cross-check when ready to finish", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "continue_document_review",
        state: "output-available",
        output: {
          status: "ready_to_finish",
          totalPages: 62,
          reviewedPages: 62,
          findingCount: 40,
        },
      },
    ]);
    expect(snapshot?.label).toBe("Cross-checking citations and duplicates…");
  });

  it("collapses to a complete line after finish", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 62,
          reviewedPages: 62,
          findingCount: 40,
        },
      },
    ]);
    expect(snapshot?.phase).toBe("complete");
    expect(snapshot?.label).toBe("Complete: reviewed 62/62 pages");
    expect(snapshot?.pending).toBe(false);
  });
});
