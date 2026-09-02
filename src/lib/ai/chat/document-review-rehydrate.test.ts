import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { DocumentReviewSession } from "@/lib/ai/chat/document-review";
import {
  findPriorFinishedDocumentReview,
  rehydrateDocumentReviewIfCoverageUnchanged,
  retrievalPolicyAfterCoverageDelta,
} from "@/lib/ai/chat/document-review-rehydrate";

describe("findPriorFinishedDocumentReview", () => {
  it("recovers coverage from start + finish tool parts", () => {
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-start_document_review",
            toolCallId: "s1",
            state: "output-available",
            input: { objective: "inventory" },
            output: {
              status: "started",
              attachmentIds: ["att_a", "att_b"],
              documents: [
                { attachmentId: "att_a", pageCount: 10 },
                { attachmentId: "att_b", pageCount: 5 },
              ],
              totalPages: 15,
            },
          },
          {
            type: "tool-finish_document_review",
            toolCallId: "f1",
            state: "output-available",
            input: {},
            output: {
              status: "complete",
              coverageComplete: true,
              reviewedPages: 15,
              totalPages: 15,
              recommendedInventory: {
                ids: ["REQ-1"],
                sourceKind: "verified_table",
                confidence: "high",
                citations: [],
              },
            },
          },
        ],
      },
    ];

    const prior = findPriorFinishedDocumentReview(messages);
    expect(prior?.coverageKey).toContain("att_a:10:");
    expect(prior?.coverageKey).toContain("att_b:5:");
    expect(prior?.recommendedInventory?.ids).toEqual(["REQ-1"]);
  });
});

describe("rehydrateDocumentReviewIfCoverageUnchanged", () => {
  it("restores a finished session when ready docs match prior coverage", () => {
    const session = new DocumentReviewSession();
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-start_document_review",
            toolCallId: "s1",
            state: "output-available",
            input: {},
            output: {
              status: "started",
              attachmentIds: ["att_a"],
              documents: [{ attachmentId: "att_a", pageCount: 3 }],
            },
          },
          {
            type: "tool-finish_document_review",
            toolCallId: "f1",
            state: "output-available",
            input: {},
            output: {
              status: "complete",
              coverageComplete: true,
              totalPages: 3,
              reviewedPages: 3,
            },
          },
        ],
      },
    ];

    const result = rehydrateDocumentReviewIfCoverageUnchanged({
      session,
      messages,
      readyDocuments: [
        { attachmentId: "att_a", pageCount: 3, ingestRunId: null },
      ],
    });
    expect(result.restored).toBe(true);
    expect(session.isFinished()).toBe(true);
  });

  it("does not restore when skipRestore is set (pushback re-review)", () => {
    const session = new DocumentReviewSession();
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-finish_document_review",
            toolCallId: "f1",
            state: "output-available",
            input: {},
            output: {
              status: "complete",
              coverageKey: "att_a:3:unknown",
              coverageComplete: true,
            },
          },
        ],
      },
    ];
    const result = rehydrateDocumentReviewIfCoverageUnchanged({
      session,
      messages,
      readyDocuments: [
        { attachmentId: "att_a", pageCount: 3, ingestRunId: null },
      ],
      skipRestore: true,
    });
    expect(result.restored).toBe(false);
    expect(session.isFinished()).toBe(false);
    expect(result.prior?.coverageKey).toBe("att_a:3:unknown");
  });

  it("does not restore when page coverage changed", () => {
    const session = new DocumentReviewSession();
    const messages: UIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-finish_document_review",
            toolCallId: "f1",
            state: "output-available",
            input: {},
            output: {
              status: "complete",
              coverageKey: "att_a:3:unknown",
              coverageComplete: true,
            },
          },
        ],
      },
    ];
    const result = rehydrateDocumentReviewIfCoverageUnchanged({
      session,
      messages,
      readyDocuments: [
        { attachmentId: "att_a", pageCount: 8, ingestRunId: null },
      ],
    });
    expect(result.restored).toBe(false);
    expect(session.isFinished()).toBe(false);
  });
});

describe("retrievalPolicyAfterCoverageDelta", () => {
  it("downgrades comprehensive to adaptive when coverage is unchanged", () => {
    expect(
      retrievalPolicyAfterCoverageDelta({
        policy: "comprehensive",
        coverageUnchanged: true,
      })
    ).toBe("adaptive");
  });

  it("keeps comprehensive on pushback even when coverage is unchanged", () => {
    expect(
      retrievalPolicyAfterCoverageDelta({
        policy: "comprehensive",
        coverageUnchanged: true,
        keepComprehensive: true,
      })
    ).toBe("comprehensive");
  });

  it("keeps comprehensive when coverage grew", () => {
    expect(
      retrievalPolicyAfterCoverageDelta({
        policy: "comprehensive",
        coverageUnchanged: false,
      })
    ).toBe("comprehensive");
  });
});
