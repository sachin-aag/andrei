import { describe, expect, it } from "vitest";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { MECHANICAL_RESULTS_HEADERS } from "@/lib/document-types/mechanical/sections";
import {
  alreadyDraftedBlock,
  alreadyDraftedGapHints,
  alreadyDraftedReadStep,
  detectAlreadyDraftedSection,
  isExplicitDocumentEdit,
  isExplicitSectionRewrite,
  isLandWholeDraftRequest,
  isRemainingProseEdit,
  isWholeFieldReplaceTurn,
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
    expect(
      isExplicitSectionRewrite("make 15.6 as mlt 1303. redraft accordingly")
    ).toBe(true);
    expect(isExplicitSectionRewrite("make 15.6 as MLT-1303")).toBe(true);
    expect(isExplicitSectionRewrite("re-draft section 15.6")).toBe(true);
  });

  it("does not treat ordinary draft or edit phrasing as a full rewrite", () => {
    expect(isExplicitSectionRewrite("draft testers section")).toBe(false);
    expect(isExplicitSectionRewrite("remove VCS from Purpose")).toBe(false);
    expect(isExplicitSectionRewrite("insert suggestions for 15.6.1")).toBe(
      false
    );
    expect(isExplicitSectionRewrite("")).toBe(false);
  });
});

describe("isLandWholeDraftRequest", () => {
  it("matches insert-it confirmations, not named suggestion cards", () => {
    expect(isLandWholeDraftRequest("insert it")).toBe(true);
    expect(isLandWholeDraftRequest("go ahead and insert it")).toBe(true);
    expect(isLandWholeDraftRequest("go ahead and insert that")).toBe(true);
    expect(isLandWholeDraftRequest("insert the suggestion")).toBe(false);
    expect(isLandWholeDraftRequest("insert suggestions for 15.6.1")).toBe(
      false
    );
    expect(isLandWholeDraftRequest("go ahead")).toBe(false);
  });
});

describe("isRemainingProseEdit", () => {
  it("matches leftover 15.N heading/prose after tables landed", () => {
    expect(isRemainingProseEdit("go for 15.6.1")).toBe(true);
    expect(isRemainingProseEdit("insert suggestions for 15.6.1")).toBe(true);
    expect(isRemainingProseEdit("go ahead and make these")).toBe(true);
    expect(
      isRemainingProseEdit(
        "updated these but a few more suggestions need to be made"
      )
    ).toBe(true);
    expect(isRemainingProseEdit("insertions are really failing for 15.6")).toBe(
      true
    );
    expect(isRemainingProseEdit("insert the suggestion")).toBe(false);
    expect(isRemainingProseEdit("make 15.6 as mlt 1303")).toBe(false);
    expect(isRemainingProseEdit("add a table to 15.2.3.2")).toBe(false);
    expect(isRemainingProseEdit("create a table under 15.2.3.2")).toBe(false);
  });
});

describe("isWholeFieldReplaceTurn", () => {
  it("treats insert-it after a 15.N redraft as a whole-field replace", () => {
    expect(
      isWholeFieldReplaceTurn("insert it", [
        "make 15.6 as mlt 1303. redraft accordingly",
        "insert it",
      ])
    ).toBe(true);
    expect(isWholeFieldReplaceTurn("insert it")).toBe(false);
    expect(
      isWholeFieldReplaceTurn("insert suggestions for 15.6.1", [
        "make 15.6 as mlt 1303. redraft accordingly",
      ])
    ).toBe(false);
  });
});

describe("isExplicitDocumentEdit", () => {
  it("matches a request to land a suggestion in the document", () => {
    expect(
      isExplicitDocumentEdit("insert the suggestion please. edit the document")
    ).toBe(true);
    expect(isExplicitDocumentEdit("suggestions are not landing")).toBe(true);
    expect(isExplicitDocumentEdit("it is only summarising the change")).toBe(
      true
    );
    expect(isExplicitDocumentEdit("insert it")).toBe(true);
    expect(isExplicitDocumentEdit("go ahead and insert it")).toBe(true);
    expect(
      isExplicitDocumentEdit("make 15.6 as mlt 1303. redraft accordingly")
    ).toBe(true);
    expect(
      isExplicitDocumentEdit("insertions are really failing for 15.6")
    ).toBe(true);
    expect(isExplicitDocumentEdit("go ahead and make these")).toBe(true);
    expect(isExplicitDocumentEdit("go for 15.6.1")).toBe(true);
    expect(
      isExplicitDocumentEdit(
        "updated these but a few more suggestions need to be made"
      )
    ).toBe(true);
    expect(isExplicitDocumentEdit("add a table to 15.2.3.2")).toBe(true);
  });

  it("does not treat a lookup as a document edit", () => {
    expect(isExplicitDocumentEdit("what is in section 3.12?")).toBe(false);
    expect(isExplicitDocumentEdit("go ahead")).toBe(false);
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

  it("does not gate insert-it after a 15.N redraft", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "insert it",
        userIntentKind: "write",
        documentType: "cleaning_verification_protocol",
        sectionScope: "cvp_equipment_sampling",
        recentUserTexts: ["make 15.6 as mlt 1303. redraft accordingly"],
        sections: {
          testers_dates: testersDoc(FILLED_TESTERS),
        },
      })
    ).toBeNull();
  });

  it("does not treat header-only seeded results tables as already drafted", () => {
    expect(
      detectAlreadyDraftedSection({
        userText: "draft the Requirements Verified section",
        userIntentKind: "write",
        documentType: "mechanical_design_verification",
        sections: {
          requirements_verified: {
            hardwareTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
            systemTable: seededTableDoc(MECHANICAL_RESULTS_HEADERS),
          },
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
    expect(block).toContain("insert, apply, or edit the document");
    expect(block).toContain("leftover 15.N heading");
    expect(block).toContain("Do not say write tools are disabled");
    expect(block).toContain("hint field is an expected format");
    expect(block).toContain("Material gap only");
    expect(block).toContain("Empty cells they asked to fill");
    expect(block).toContain("13.6 → 13.6 – Gasket material verified as PTFE");
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
