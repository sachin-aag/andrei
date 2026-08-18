import { describe, expect, it } from "vitest";
import {
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

  it("keeps narrow fact lookups focused", () => {
    const decision = classifyRetrievalPolicy({
      userText: "What is the pass/fail result for SW-LWB-4 on page 31?",
      hasDocuments: true,
      mentionedPageCount: 62,
    });
    expect(decision.policy).toBe("focused");
    expect(decision.reason).toBe("specific_fact_or_draft");
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

  it("does not widen a large tagged document on a title question", () => {
    const decision = classifyRetrievalPolicy({
      userText: "What is the document number on the cover?",
      mentionedPageCount: 62,
      hasDocuments: true,
    });
    expect(decision.policy).toBe("focused");
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
