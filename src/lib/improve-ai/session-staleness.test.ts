import { describe, expect, it } from "vitest";
import { sectionContentHash } from "@/lib/ai/suggestion-gating";
import { isImproveAiSessionStale } from "@/lib/improve-ai/session-staleness";

const defineContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Deviation text" }] }],
};

function feedbackRow(overrides: Partial<{
  criterionKey: string;
  section: "define" | "measure";
  aiStatus: "met" | "not_met";
  aiReasoning: string;
}> = {}) {
  return {
    id: "resp-1",
    sessionId: "session-1",
    criterionKey: overrides.criterionKey ?? "define.what_happened",
    section: overrides.section ?? "define",
    aiStatus: overrides.aiStatus ?? "met",
    aiReasoning: overrides.aiReasoning ?? "Clear description.",
    criteriaEvaluationAgreement: null,
    reasoningAgreement: null,
    humanComment: "",
    suggestedStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function evaluationRow(overrides: Partial<{
  criterionKey: string;
  section: "define" | "measure";
  status: "met" | "not_met";
  reasoning: string;
  evaluatedContentHash: string;
}> = {}) {
  const hash = sectionContentHash("define", defineContent);
  return {
    id: "eval-1",
    reportId: "report-1",
    sectionId: "section-1",
    criterionKey: overrides.criterionKey ?? "define.what_happened",
    section: overrides.section ?? "define",
    criterionLabel: "What happened",
    status: overrides.status ?? "met",
    reasoning: overrides.reasoning ?? "Clear description.",
    bypassed: false,
    evaluatedContentHash: overrides.evaluatedContentHash ?? hash,
    updatedAt: new Date(),
  };
}

describe("isImproveAiSessionStale", () => {
  it("returns false when session has no responses yet", () => {
    expect(
      isImproveAiSessionStale({
        responses: [],
        evaluations: [evaluationRow()],
        sectionContents: { define: defineContent },
      })
    ).toBe(false);
  });

  it("returns false when feedback matches current evaluations and content", () => {
    expect(
      isImproveAiSessionStale({
        responses: [feedbackRow()],
        evaluations: [evaluationRow()],
        sectionContents: { define: defineContent },
      })
    ).toBe(false);
  });

  it("returns true when section content changed since evaluation", () => {
    const editedContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Edited text" }] },
      ],
    };
    expect(
      isImproveAiSessionStale({
        responses: [feedbackRow()],
        evaluations: [evaluationRow()],
        sectionContents: { define: editedContent },
      })
    ).toBe(true);
  });

  it("returns true when feedback snapshot differs from criteria evaluations", () => {
    expect(
      isImproveAiSessionStale({
        responses: [feedbackRow({ aiStatus: "not_met", aiReasoning: "Old reasoning" })],
        evaluations: [evaluationRow({ status: "met", reasoning: "Clear description." })],
        sectionContents: { define: defineContent },
      })
    ).toBe(true);
  });

  it("returns true when evaluations exist for content but feedback is missing", () => {
    expect(
      isImproveAiSessionStale({
        responses: [feedbackRow({ criterionKey: "define.what_happened" })],
        evaluations: [
          evaluationRow({ criterionKey: "define.what_happened" }),
          evaluationRow({ criterionKey: "define.why_important", section: "define" }),
        ],
        sectionContents: { define: defineContent },
      })
    ).toBe(true);
  });
});
