import { describe, expect, it } from "vitest";
import { classifyRetrievalPolicy } from "./retrieval-policy";
import { detectSectionIntentFromText } from "./section-intent";
import { classifyChatUserIntent } from "./user-intent";
import { assembleRulesChatTurnPlan } from "./turn-plan";

describe("assembleChatTurnPlan (characterization)", () => {
  it("emits the same intent + retrievalPolicy as the standalone classifiers", () => {
    const fixtures = [
      { userText: "hi", hasDocuments: true },
      {
        userText: "What is the pass/fail result for SW-LWB-4 on page 31?",
        hasDocuments: true,
        mentionedPageCount: 62,
        documentType: "design_verification" as const,
      },
      {
        userText:
          "how should we go about drafting a requirements/results table from Appendix B? all the answers are there",
        hasDocuments: true,
        mentionedPageCount: 62,
      },
      {
        userText: "rewrite the last sentence in Purpose",
        hasDocuments: true,
        documentType: "design_verification" as const,
      },
    ];
    for (const fixture of fixtures) {
      const intent = classifyChatUserIntent({
        userText: fixture.userText,
        mode: "agent",
      });
      const retrieval = classifyRetrievalPolicy(fixture);
      const plan = assembleRulesChatTurnPlan(fixture);
      expect(plan.intent).toBe(intent.kind);
      expect(plan.intentReason).toBe(intent.reason);
      expect(plan.retrievalPolicy).toBe(retrieval.policy);
      expect(plan.retrievalReason).toBe(retrieval.reason);
    }
  });

  it("carries section intent and review objective from the same latest turn", () => {
    const plan = assembleRulesChatTurnPlan({
      userText: "draft Purpose from the protocol",
      documentType: "design_verification",
      hasDocuments: true,
    });
    expect(plan.sectionIntent).toBe(
      detectSectionIntentFromText(
        "draft Purpose from the protocol",
        "design_verification"
      )
    );
    expect(plan.reviewObjective).toBe(plan.sectionIntent ?? plan.reviewObjective);
  });

  it("does not mark a greeting as already drafted", () => {
    const plan = assembleRulesChatTurnPlan({
      userText: "hi",
      documentType: "design_verification",
      hasDocuments: true,
      sections: {
        purpose: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Filled purpose text." }],
              },
            ],
          },
        },
      },
    });
    expect(plan.intent).toBe("social");
    expect(plan.alreadyDrafted).toBeNull();
    expect(plan.retrievalPolicy).toBe("focused");
    expect(plan.retrievalReason).toBe("no_task");
  });

  it("routes a populated placeholder fill through the turn plan, not a page walk", () => {
    const plan = assembleRulesChatTurnPlan({
      userText: "fill the placeholders in tables 9–11",
      documentType: "equipment_lifecycle_report",
      hasDocuments: true,
      totalReadyPages: 273,
      sections: {
        elr_preventive_maintenance: {
          table: {
            type: "doc",
            content: [
              {
                type: "table",
                content: [
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableHeader",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Document" }],
                          },
                        ],
                      },
                      {
                        type: "tableHeader",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Date" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableCell",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "PM-EL-12" }],
                          },
                        ],
                      },
                      {
                        type: "tableCell",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "<date>" }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    });
    expect(plan.retrievalPolicy).toBe("adaptive");
    expect(plan.retrievalReason).toBe("placeholder_fill");
  });
});
