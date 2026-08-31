import { describe, expect, it } from "vitest";
import { getDocumentType } from "@/lib/document-types";
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

  it("keeps a single requirement-id lookup on the agentic path, not a page walk", () => {
    const decision = classifyRetrievalPolicy({
      userText: "What is the pass/fail result for SW-LWB-4 on page 31?",
      hasDocuments: true,
      mentionedPageCount: 62,
      documentType: "design_verification",
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("bounded_locator");
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
      documentType: "design_verification",
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
      documentType: "design_verification",
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("agentic_default");
  });

  it("escalates Convergent Results inventory requests", () => {
    const completeSet = classifyRetrievalPolicy({
      userText: "populate the results matrix with the complete set of test cases",
      sectionScope: "results_and_discussions",
      hasDocuments: true,
    });
    expect(completeSet.policy).toBe("comprehensive");

    const scopedTable = classifyRetrievalPolicy({
      userText: "Fill the table with the requirement rows",
      sectionScope: "results_and_discussions",
      hasDocuments: true,
    });
    expect(scopedTable.policy).toBe("comprehensive");
    expect(scopedTable.reason).toBe("matrix_section_inventory");
  });

  it("does not let a quick-mode override win over inventory language", () => {
    const decision = classifyRetrievalPolicy({
      userText: "in quick mode, list every test from Appendix B",
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
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

  it("escalates an unscoped draft-report on a distributed DV catalog", () => {
    const decision = classifyRetrievalPolicy({
      userText: "draft report",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 62,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("open_set_distributed");
  });

  it("keeps an unscoped draft-report adaptive on a short DV attachment", () => {
    const decision = classifyRetrievalPolicy({
      userText: "draft report",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 3,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("agentic_default");
  });

  it("keeps an equipment draft adaptive even when the catalog is large", () => {
    const decision = classifyRetrievalPolicy({
      userText:
        "which equipment was used for testing? lets draft the relevant section for this",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 62,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("agentic_default");
  });

  it("keeps a named requirement on a labelled page adaptive on a large DV catalog", () => {
    const decision = classifyRetrievalPolicy({
      userText: "SW-LWB-4 on page 31",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 62,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("bounded_locator");
  });

  it("escalates a scoped inventory section without fill/complete verbs", () => {
    const decision = classifyRetrievalPolicy({
      userText: "write this up",
      sectionScope: "traceability",
      documentType: "design_verification",
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("matrix_section_inventory");
  });

  it("escalates a scoped Results section without fill verbs", () => {
    const decision = classifyRetrievalPolicy({
      userText: "do this section",
      sectionScope: "results_and_discussions",
      hasDocuments: true,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("matrix_section_inventory");
  });

  it("keeps investigation draft-report adaptive even with a large attachment", () => {
    const decision = classifyRetrievalPolicy({
      userText: "draft report",
      sectionScope: "all",
      documentType: "investigation_report",
      hasDocuments: true,
      totalReadyPages: 62,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("agentic_default");
  });

  it("keeps a scoped single-id results question adaptive", () => {
    const decision = classifyRetrievalPolicy({
      userText: "what is P/F for SW-LWB-4",
      sectionScope: "traceability",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 62,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("bounded_locator");
  });

  it("keeps a greeting on the focused path so it cannot start a page walk", () => {
    const decision = classifyRetrievalPolicy({
      userText: "hi",
      sectionScope: "all",
      documentType: "mechanical_design_verification",
      hasDocuments: true,
      totalReadyPages: 62,
    });
    expect(decision.policy).toBe("focused");
    expect(decision.reason).toBe("no_task");
  });

  it("treats many outline siblings as distributed evidence", () => {
    const decision = classifyRetrievalPolicy({
      userText: "draft report",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 3,
      outlineSiblingCount: 6,
    });
    expect(decision.policy).toBe("comprehensive");
    expect(decision.reason).toBe("open_set_distributed");
  });

  it("keeps a sentence or paragraph rewrite adaptive on a large DV catalog", () => {
    const sentence = classifyRetrievalPolicy({
      userText:
        "change the last sentence of the first paragraph to also explain what perioguide is",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 273,
    });
    expect(sentence.policy).toBe("adaptive");
    expect(sentence.reason).toBe("targeted_rewrite");

    const paragraph = classifyRetrievalPolicy({
      userText: "rewrite first paragraph in purpose section",
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 273,
    });
    expect(paragraph.policy).toBe("adaptive");
    expect(paragraph.reason).toBe("targeted_rewrite");
  });

  it("does not let an earlier draft-report turn force another full page walk", () => {
    const decision = classifyRetrievalPolicy({
      userText:
        "change the last sentence of the first paragraph to also explain what perioguide is",
      recentUserTexts: ["draft report"],
      sectionScope: "all",
      documentType: "design_verification",
      hasDocuments: true,
      totalReadyPages: 273,
    });
    expect(decision.policy).toBe("adaptive");
    expect(decision.reason).toBe("targeted_rewrite");
  });
});

describe("document-type inventory registry", () => {
  it("registers demo DV matrices and leaves investigation empty", () => {
    expect(getDocumentType("design_verification").chat.inventorySections).toEqual(
      ["traceability", "test_results"]
    );
    expect(
      getDocumentType("investigation_report").chat.inventorySections ?? []
    ).toEqual([]);
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
