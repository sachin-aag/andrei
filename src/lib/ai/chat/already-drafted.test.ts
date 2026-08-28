import { describe, expect, it } from "vitest";
import {
  alreadyDraftedBlock,
  alreadyDraftedGapHints,
  alreadyDraftedReadStep,
  detectAlreadyDraftedSection,
  isSectionDraftRequest,
} from "./already-drafted";
import { sectionFillState } from "./fields";

function testersDoc(text: string) {
  return {
    testers: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

const FILLED_TESTERS =
  "All testing was performed by Convergent Dental Test Engineers Dylan Burke and Wesley Harrington between 15 June 2023 and 19 July 2023.";

describe("isSectionDraftRequest", () => {
  it("matches draft / fill / write phrasing", () => {
    expect(isSectionDraftRequest("draft testers section")).toBe(true);
    expect(isSectionDraftRequest("Please fill in Testers/Dates")).toBe(true);
    expect(isSectionDraftRequest("write up the testers")).toBe(true);
  });

  it("skips explicit rewrite / replace requests", () => {
    expect(isSectionDraftRequest("rewrite testers from the attachments")).toBe(
      false
    );
    expect(isSectionDraftRequest("replace the testers section")).toBe(false);
    expect(isSectionDraftRequest("start over on testers")).toBe(false);
  });

  it("ignores questions that are not produce requests", () => {
    expect(isSectionDraftRequest("who are the testers?")).toBe(false);
    expect(isSectionDraftRequest("")).toBe(false);
  });
});

describe("detectAlreadyDraftedSection", () => {
  it("detects a filled testers section on a draft request", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft testers section",
      documentType: "mechanical_design_verification",
      sections: { testers_dates: testersDoc(FILLED_TESTERS) },
    });
    expect(found).toEqual({ section: "testers_dates", fillState: "filled" });
  });

  it("uses the section dropdown when the message says draft this section", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft this section",
      sectionScope: "testers_dates",
      documentType: "mechanical_design_verification",
      sections: { testers_dates: testersDoc(FILLED_TESTERS) },
    });
    expect(found?.section).toBe("testers_dates");
    expect(found?.fillState).toBe("filled");
  });

  it("detects a filled Define on an investigation draft request", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft the define section",
      documentType: "investigation_report",
      sections: {
        define: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: FILLED_TESTERS }],
              },
            ],
          },
        },
      },
    });
    expect(found).toEqual({ section: "define", fillState: "filled" });
  });

  it("returns null when the section is empty", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "draft testers section",
        documentType: "mechanical_design_verification",
        sections: { testers_dates: testersDoc("") },
      })
    ).toBeNull();
  });

  it("returns null when they asked to rewrite", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "rewrite testers from the protocol",
        documentType: "mechanical_design_verification",
        sections: { testers_dates: testersDoc(FILLED_TESTERS) },
      })
    ).toBeNull();
  });

  it("marks a short stub as partial", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft testers section",
      documentType: "mechanical_design_verification",
      sections: { testers_dates: testersDoc("Dylan Burke.") },
    });
    expect(found).toEqual({ section: "testers_dates", fillState: "partial" });
  });
});

describe("sectionFillState", () => {
  it("treats empty testers as empty", () => {
    expect(sectionFillState(testersDoc(""), "testers_dates")).toBe("empty");
  });
});

describe("alreadyDraftedGapHints", () => {
  it("returns not_evaluated when the section has no AI Check rows", () => {
    expect(
      alreadyDraftedGapHints("testers_dates", [
        { section: "purpose", status: "not_met", criterionLabel: "Other" },
      ])
    ).toEqual({ kind: "not_evaluated" });
  });

  it("returns all_met when every criterion passed", () => {
    expect(
      alreadyDraftedGapHints("testers_dates", [
        {
          section: "testers_dates",
          status: "met",
          criterionLabel: "Names and dates",
        },
      ])
    ).toEqual({ kind: "all_met" });
  });

  it("returns partial and not_met gaps with trimmed reasoning", () => {
    expect(
      alreadyDraftedGapHints("testers_dates", [
        {
          section: "testers_dates",
          status: "partially_met",
          criterionLabel: "Date range stated",
          reasoning: "Start date present; end date missing.",
        },
        {
          section: "testers_dates",
          status: "not_met",
          criterionLabel: "Tester names",
          bypassed: true,
        },
        {
          section: "testers_dates",
          status: "not_met",
          criterionLabel: "Signatures",
        },
      ])
    ).toEqual({
      kind: "gaps",
      gaps: [
        {
          status: "partially_met",
          label: "Date range stated",
          reasoning: "Start date present; end date missing.",
        },
        { status: "not_met", label: "Signatures" },
      ],
    });
  });
});

describe("alreadyDraftedBlock", () => {
  it("tells agent mode to read first and not quiz for known facts", () => {
    const block = alreadyDraftedBlock(
      { section: "testers_dates", fillState: "filled" },
      "agent"
    );
    expect(block).toContain("Already drafted (review first)");
    expect(block).toContain("Testers/Dates");
    expect(block).toContain("read_section");
    expect(block).toContain("Do not call search_documents or ask_user yet");
    expect(block).toContain("targeted propose_edit");
    expect(block).toContain("hint field is an expected format");
    expect(block).toContain("Material gap only");
    expect(block).toContain("Recipe conflict");
  });

  it("lists AI Check gap hints when provided", () => {
    const block = alreadyDraftedBlock(
      { section: "testers_dates", fillState: "filled" },
      "agent",
      {
        kind: "gaps",
        gaps: [{ status: "not_met", label: "End date missing" }],
      }
    );
    expect(block).toContain("AI Check flagged for this section");
    expect(block).toContain("not met: End date missing");
  });

  it("notes when AI Check passed every criterion", () => {
    const block = alreadyDraftedBlock(
      { section: "testers_dates", fillState: "filled" },
      "plan",
      { kind: "all_met" }
    );
    expect(block).toContain("all criteria met for this section");
  });
});

describe("alreadyDraftedReadStep", () => {
  it("forces read_section on the first step only", () => {
    expect(
      alreadyDraftedReadStep({
        stepsTaken: 0,
        alreadyDrafted: true,
        hasReadSectionTool: true,
      })
    ).toEqual({
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    });
    expect(
      alreadyDraftedReadStep({
        stepsTaken: 1,
        alreadyDrafted: true,
        hasReadSectionTool: true,
      })
    ).toBeUndefined();
    expect(
      alreadyDraftedReadStep({
        stepsTaken: 0,
        alreadyDrafted: false,
        hasReadSectionTool: true,
      })
    ).toBeUndefined();
  });
});
