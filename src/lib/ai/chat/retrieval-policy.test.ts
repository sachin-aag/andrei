import { describe, expect, it } from "vitest";
import {
  chatThinkingLevel,
  classifyRetrievalPolicy,
  recentUserMessageTexts,
} from "./retrieval-policy";

const originalRequest =
  "how should we go about drafting a requirements/results table from Appendix B? all the answers are there";

describe("classifyRetrievalPolicy", () => {
  it("escalates the original requirements/results table request", () => {
    const decision = classifyRetrievalPolicy({
      userText: originalRequest,
      hasDocuments: true,
      mentionedPageCount: 62,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("exhaustive_output_shape");
  });

  it("escalates missing SST/SIB/LWB/LCB follow-ups", () => {
    const decision = classifyRetrievalPolicy({
      userText: "Be comprehensive. You missed SST, SIB / LWB / LCB. Don't miss any.",
      recentUserTexts: [originalRequest],
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
  });

  it("escalates keep-going follow-ups", () => {
    const decision = classifyRetrievalPolicy({
      userText: "keep going — still missing tests",
      recentUserTexts: [originalRequest],
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
  });

  it("keeps a single requirement-id lookup on the agentic path, not a page walk", () => {
    const decision = classifyRetrievalPolicy({
      userText: "What is the pass/fail result for SW-LWB-4 on page 31?",
      hasDocuments: true,
      mentionedPageCount: 62,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("agentic_default");
  });

  it("escalates a family-code follow-up that is not a single requirement id", () => {
    const decision = classifyRetrievalPolicy({
      userText: "You missed SST, SIB / LWB / LCB.",
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("completeness_follow_up");
  });

  it("keeps explicit quick overviews focused", () => {
    const decision = classifyRetrievalPolicy({
      userText: "Give me a quick high-level summary of Appendix B",
      hasDocuments: true,
      mentionedPageCount: 62,
    });
    expect(decision.policy).toBe("focused");
    expect(decision.reason).toBe("explicit_quick_overview");
  });

  it("escalates traceability inventory on that section", () => {
    const decision = classifyRetrievalPolicy({
      userText: "Fill the table with the requirement rows",
      sectionScope: "traceability",
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("matrix_section_inventory");
  });

  it("does not force a full review for a title question on a large tagged document", () => {
    const decision = classifyRetrievalPolicy({
      userText: "What is the document number on the cover?",
      mentionedPageCount: 62,
      hasDocuments: true,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("agentic_default");
  });

  it("keeps equipment and UUT table drafts on the agentic path", () => {
    const equipment = classifyRetrievalPolicy({
      userText:
        "which equipment was used for testing? lets draft the relevant section for this",
      hasDocuments: true,
    });
    expect(equipment.policy).toBe("adaptive");
    expect(equipment.reason).toBe("agentic_default");

    const followUp = classifyRetrievalPolicy({
      userText:
        "nice. also include the solea systems into this table in the same schema",
      recentUserTexts: [
        "which equipment was used for testing? lets draft the relevant section for this",
      ],
      hasDocuments: true,
    });
    expect(followUp.policy).toBe("adaptive");
    expect(followUp.reason).toBe("agentic_default");
  });
});

describe("chatThinkingLevel", () => {
  it("uses medium thinking until we route thinking by task", () => {
    expect(chatThinkingLevel("focused")).toBe("medium");
    expect(chatThinkingLevel("adaptive")).toBe("medium");
    expect(chatThinkingLevel("comprehensive")).toBe("medium");
  });
});

describe("recentUserMessageTexts", () => {
  it("keeps the last user turns", () => {
    expect(
      recentUserMessageTexts(
        [
          { role: "user", parts: [{ type: "text", text: "one" }] },
          { role: "assistant", parts: [{ type: "text", text: "ok" }] },
          { role: "user", parts: [{ type: "text", text: "two" }] },
          { role: "user", parts: [{ type: "text", text: "three" }] },
        ],
        2
      )
    ).toEqual(["two", "three"]);
  });
});
