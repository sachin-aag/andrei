import { describe, expect, it } from "vitest";
import {
  reviewDocumentDetailLabel,
  reviewDocumentsFromParts,
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

  it("shows reviewing, not planning, while the first continue is in flight", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: { status: "started", totalPages: 12, remainingBatches: 3 },
      },
      {
        toolName: "continue_document_review",
        state: "input-available",
      },
    ]);
    expect(snapshot?.phase).toBe("reviewing");
    expect(snapshot?.label).toBe(
      "Reviewing pages in parallel · 0/12 done"
    );
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

  it("treats a refused second start as complete, not planning", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 8,
          reviewedPages: 8,
        },
      },
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          status: "already_complete",
          totalPages: 8,
          reviewedPages: 8,
        },
      },
    ]);
    expect(snapshot?.phase).toBe("complete");
    expect(snapshot?.label).toBe("Complete: reviewed 8/8 pages");
  });

  it("names the reviewed files on the complete line", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          status: "started",
          totalPages: 87,
          remainingBatches: 15,
          documents: [
            {
              attachmentId: "att_sop",
              filename: "ELR-SOP.pdf",
              pageCount: 87,
            },
          ],
        },
      },
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 87,
          reviewedPages: 87,
        },
      },
    ]);
    expect(snapshot?.label).toBe(
      "Complete: reviewed 87/87 pages in ELR-SOP.pdf"
    );
  });

  it("summarizes more than two files", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          status: "started",
          totalPages: 40,
          documents: [
            { filename: "a.pdf", attachmentId: "a" },
            { filename: "b.pdf", attachmentId: "b" },
            { filename: "c.pdf", attachmentId: "c" },
          ],
        },
      },
    ]);
    expect(snapshot?.label).toBe(
      "Planning a complete review of 40 pages in a.pdf and 2 more files…"
    );
  });

  it("names queued files, not the first vault file, on the planning chip", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          status: "started",
          totalPages: 3,
          documents: [
            {
              filename: "PRQR-25-PR-005 Report.pdf",
              attachmentId: "prqr",
            },
          ],
        },
      },
    ]);
    expect(snapshot?.label).toBe(
      "Planning a complete review of 3 pages in PRQR-25-PR-005 Report.pdf…"
    );
    expect(snapshot?.label).not.toContain("Calibration Planner");
    expect(snapshot?.label).not.toContain("more files");
  });

  it("keeps a finding count after finish omits findingCount", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "continue_document_review",
        state: "output-available",
        output: {
          status: "ready_to_finish",
          totalPages: 12,
          reviewedPages: 12,
          findingCount: 9,
        },
      },
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 12,
          reviewedPages: 12,
        },
      },
    ]);
    expect(snapshot?.findingCount).toBe(9);
  });
});

describe("reviewDocumentsFromParts", () => {
  it("merges page counts, continue progress, and skipped files", () => {
    const docs = reviewDocumentsFromParts([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          documents: [
            {
              attachmentId: "urs",
              filename: "User Requirement Specification.PDF",
              pageCount: 12,
            },
          ],
          skippedDocuments: [
            { attachmentId: "oq", filename: "CSV-OQ.pdf", pageCount: 40 },
          ],
        },
      },
      {
        toolName: "continue_document_review",
        state: "output-available",
        output: {
          byAttachment: [
            {
              attachmentId: "urs",
              filename: "User Requirement Specification.PDF",
              reviewed: 12,
              queued: 12,
            },
          ],
        },
      },
    ]);
    expect(docs).toEqual([
      expect.objectContaining({
        filename: "User Requirement Specification.PDF",
        pageCount: 12,
        reviewed: 12,
        queued: 12,
      }),
      expect.objectContaining({
        filename: "CSV-OQ.pdf",
        skipped: true,
      }),
    ]);
    expect(reviewDocumentDetailLabel(docs[0]!)).toBe(
      "User Requirement Specification.PDF · 12/12 pages"
    );
    expect(reviewDocumentDetailLabel(docs[1]!)).toBe("Skipped CSV-OQ.pdf");
  });
});
