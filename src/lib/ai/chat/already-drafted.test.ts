import { describe, expect, it } from "vitest";
import {
  alreadyDraftedBlock,
  alreadyDraftedGapHints,
  alreadyDraftedReadStep,
  detectAlreadyDraftedSection,
  isExplicitSectionRewrite,
  withoutDraftFieldTools,
} from "./already-drafted";
import { fieldFillState, sectionFillState } from "./fields";

function testersDoc(text: string) {
  return {
    testers: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

function purposeDoc(text: string) {
  return {
    narrative: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

const FILLED_TESTERS =
  "All testing was performed by Convergent Dental Test Engineers Dylan Burke and Wesley Harrington between 15 June 2023 and 19 July 2023.";

describe("isExplicitSectionRewrite", () => {
  it("matches rewrite / replace / start-over phrasing", () => {
    expect(isExplicitSectionRewrite("rewrite testers from the attachments")).toBe(
      true
    );
    expect(isExplicitSectionRewrite("replace the testers section")).toBe(true);
    expect(isExplicitSectionRewrite("start over on testers")).toBe(true);
  });

  it("does not treat ordinary draft or edit phrasing as a full rewrite", () => {
    expect(isExplicitSectionRewrite("draft testers section")).toBe(false);
    expect(isExplicitSectionRewrite("remove VCS from Purpose")).toBe(false);
    expect(isExplicitSectionRewrite("")).toBe(false);
  });
});

describe("detectAlreadyDraftedSection", () => {
  it("detects a filled testers section on a draft request", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft testers section",
      userIntentKind: "write",
      documentType: "mechanical_design_verification",
      sections: { testers_dates: testersDoc(FILLED_TESTERS) },
    });
    expect(found).toEqual({ section: "testers_dates", fillState: "filled" });
  });

  it("uses the tagged section when the message says draft this section", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft this section",
      userIntentKind: "write",
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
      userIntentKind: "write",
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
      userIntentKind: "write",
        documentType: "mechanical_design_verification",
        sections: { testers_dates: testersDoc("") },
      })
    ).toBeNull();
  });

  it("returns null when they asked to rewrite", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "rewrite testers from the protocol",
      userIntentKind: "write",
        documentType: "mechanical_design_verification",
        sections: { testers_dates: testersDoc(FILLED_TESTERS) },
      })
    ).toBeNull();
  });

  it("marks a short stub as partial", () => {
    const found = detectAlreadyDraftedSection({
      userText: "draft testers section",
      userIntentKind: "write",
      documentType: "mechanical_design_verification",
      sections: { testers_dates: testersDoc("Dylan Burke.") },
    });
    expect(found).toEqual({ section: "testers_dates", fillState: "partial" });
  });

  it("gates a filled Purpose on a remove-detail write without draft verbs", () => {
    const found = detectAlreadyDraftedSection({
      userText: "remove VCS from Purpose",
      userIntentKind: "write",
      documentType: "mechanical_design_verification",
      sections: {
        purpose: purposeDoc(
          "This verification confirms the Solea handpiece meets design inputs under protocol EXE-100. Version control follows SOP-SW-001."
        ),
      },
    });
    expect(found).toEqual({ section: "purpose", fillState: "filled" });
  });

  it("does not gate a read intent on a filled section", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "what does Purpose say?",
        userIntentKind: "read",
        documentType: "mechanical_design_verification",
        sections: {
          purpose: purposeDoc(
            "This verification confirms the Solea handpiece meets design inputs under protocol EXE-100."
          ),
        },
      })
    ).toBeNull();
  });

  it("does not gate an explicit rewrite of a filled section", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "rewrite Purpose from scratch",
        userIntentKind: "write",
        documentType: "mechanical_design_verification",
        sections: {
          purpose: purposeDoc(
            "This verification confirms the Solea handpiece meets design inputs under protocol EXE-100."
          ),
        },
      })
    ).toBeNull();
  });
});

describe("sectionFillState", () => {
  it("treats empty testers as empty", () => {
    expect(sectionFillState(testersDoc(""), "testers_dates")).toBe("empty");
  });

  it("is filled when a non-primary field is populated and the primary is empty", () => {
    const emptyNarrative = {
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    };
    const filledTable = {
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
                      content: [{ type: "text", text: "Requirement" }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Result" }],
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
                      content: [
                        {
                          type: "text",
                          text: "SYS-FN-037 assay dissolution measured 68 percent versus the 80 percent specification limit on batch B24017; the failure is documented in the laboratory worksheet.",
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Fail" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const content = { narrative: emptyNarrative, table: filledTable };
    expect(fieldFillState(content, "results_and_discussions", "narrative")).toBe(
      "empty"
    );
    expect(fieldFillState(content, "results_and_discussions", "table")).toBe(
      "filled"
    );
    expect(sectionFillState(content, "results_and_discussions")).toBe("filled");
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
    expect(block).toContain("Omit-if conflict");
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

describe("withoutDraftFieldTools", () => {
  it("removes draft_field and leaves other tools", () => {
    expect(
      withoutDraftFieldTools(["read_section", "draft_field", "propose_edit"])
    ).toEqual(["read_section", "propose_edit"]);
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
