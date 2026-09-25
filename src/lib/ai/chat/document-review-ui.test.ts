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
      "Planning a complete review of 40 pages across 3 files…"
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
    expect(snapshot?.label).not.toContain("across");
    expect(snapshot?.label).not.toContain("more files");
  });

  it("does not attribute a multi-file walk total to the first filename", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "start_document_review",
        state: "output-available",
        output: {
          status: "started",
          totalPages: 246,
          documents: [
            {
              filename: "User Requirement Specification.pdf",
              attachmentId: "urs",
            },
            { filename: "Design Qualification.PDF", attachmentId: "dq" },
            { filename: "IQ.PDF", attachmentId: "iq" },
            { filename: "OQ.PDF", attachmentId: "oq" },
            { filename: "PQ.PDF", attachmentId: "pq" },
          ],
        },
      },
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 246,
          reviewedPages: 246,
          documents: [
            {
              filename: "User Requirement Specification.pdf",
              attachmentId: "urs",
            },
            { filename: "Design Qualification.PDF", attachmentId: "dq" },
          ],
        },
      },
    ]);
    expect(snapshot?.label).toBe(
      "Complete: reviewed 246/246 pages across 5 files"
    );
    expect(snapshot?.label).not.toContain("User Requirement Specification");
  });

  it("names a single URS on the complete line from finish documents", () => {
    const snapshot = summarizeDocumentReviewProgress([
      {
        toolName: "finish_document_review",
        state: "output-available",
        output: {
          status: "complete",
          totalPages: 12,
          reviewedPages: 12,
          documents: [
            {
              filename: "User Requirement Specification.pdf",
              attachmentId: "urs",
            },
          ],
        },
      },
    ]);
    expect(snapshot?.label).toBe(
      "Complete: reviewed 12/12 pages in User Requirement Specification.pdf"
    );
  });
});
