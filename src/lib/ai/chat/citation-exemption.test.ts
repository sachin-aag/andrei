import { describe, expect, it } from "vitest";
import {
  alreadyStatedHaystack,
  citationGroundingMode,
  citationGroundingRunsRepair,
  contentWithoutField,
  isExemptFrameFact,
  isExplicitInsertRequest,
  isOperationalVolumeColumnLabel,
  shouldKeepOperationalVolume,
  shouldKeepUnsupportedFact,
  volumeSupportedForColumn,
} from "./citation-exemption";
import { extractHardFacts } from "./claim-facts";

describe("citationGroundingMode", () => {
  it("frames every prose field, including Purpose, recap, and assessment", () => {
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_objective",
        targetField: "narrative",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_responsibilities",
        targetField: "narrative",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_system_trends",
        targetField: "narrative",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_conclusion",
        targetField: "recommendationNarrative",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_csv_status",
        targetField: "narrative",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_scope",
        targetField: "narrative",
        tool: "draft_field",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "investigation_report",
        section: "conclusion",
        targetField: "narrative",
      })
    ).toBe("frame");
    expect(
      citationGroundingMode({
        documentType: "investigation_report",
        section: "define",
        targetField: "narrative",
      })
    ).toBe("frame");
  });

  it("keeps every table write strict, including Responsibilities and Abbreviations", () => {
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_responsibilities",
        targetField: "table",
        tool: "edit_table",
      })
    ).toBe("strict");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_abbreviations",
        targetField: "table",
        tool: "edit_table",
      })
    ).toBe("strict");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_csv_status",
        targetField: "table",
        tool: "edit_table",
      })
    ).toBe("strict");
    expect(
      citationGroundingMode({
        documentType: "qualification_summary_report",
        section: "qsr_rtm_process",
        targetField: "table",
        tool: "draft_rtm_table",
      })
    ).toBe("strict");
  });
});

describe("citationGroundingRunsRepair", () => {
  it("skips the repair search only in skip mode", () => {
    expect(citationGroundingRunsRepair("skip")).toBe(false);
    expect(citationGroundingRunsRepair("frame")).toBe(true);
    expect(citationGroundingRunsRepair("strict")).toBe(true);
  });
});

describe("alreadyStatedHaystack", () => {
  it("omits the field being written and keeps sibling table text", () => {
    const haystack = alreadyStatedHaystack({
      sections: {
        elr_csv_status: {
          narrative: { type: "doc", content: [] },
          table: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Breakdown PR/BD/001 closed." }],
              },
            ],
          },
        },
      },
      exclude: { section: "elr_csv_status", targetField: "narrative" },
    });
    expect(haystack).toContain("PR/BD/001");
    expect(contentWithoutField({ narrative: "x", table: "y" }, "narrative")).toEqual({
      table: "y",
    });
  });
});

describe("isExemptFrameFact", () => {
  const fySource = {
    reportMetadata: {
      equipmentId: "E/PR/071",
      formatScope: "Cartridge",
      periodFrom: "01-Apr-2024",
      periodTo: "31-Mar-2025",
    },
    latestUserMessageText: "lets go for cartridge. go for april 2024 to march 2025",
  };

  it("exempts title-page equipment IDs and 1 April–31 March bounds", () => {
    const facts = extractHardFacts(
      "Equipment E/PR/071. Period 01 April 2024 to 31 March 2025."
    );
    expect(facts.map((fact) => fact.text)).toEqual(
      expect.arrayContaining(["E/PR/071", "01 April 2024", "31 March 2025"])
    );
    for (const fact of facts) {
      expect(isExemptFrameFact(fact, fySource)).toBe(true);
    }
  });

  it("exempts user-stated FY month-years without title-page dates", () => {
    const facts = extractHardFacts("Period April 2024 to March 2025.");
    expect(facts.length).toBeGreaterThan(0);
    for (const fact of facts) {
      expect(
        isExemptFrameFact(fact, {
          latestUserMessageText: "go for april 2024 to march 2025",
        })
      ).toBe(true);
    }
  });

  it("exempts a fact already written in another field of this report", () => {
    const fact = extractHardFacts("Breakdown PR/BD/001 closed.")[0]!;
    expect(fact.kind).toBe("identifier");
    expect(
      isExemptFrameFact(fact, {
        alreadyStatedText: "Table: PR/BD/001 closed with CAPA CA-12.",
      })
    ).toBe(true);
  });

  it("does not exempt a mid-year event date or an invented batch", () => {
    const event = extractHardFacts("Calibrated 15 April 2024.")[0]!;
    expect(event.kind).toBe("date");
    expect(isExemptFrameFact(event, fySource)).toBe(false);

    const batch = extractHardFacts("Media fill MF-25-VIAL-01.")[0]!;
    expect(batch.kind).toBe("identifier");
    expect(isExemptFrameFact(batch, fySource)).toBe(false);
    expect(
      isExemptFrameFact(batch, {
        alreadyStatedText: "Breakdown PR/BD/001 closed.",
      })
    ).toBe(false);
  });

  it("exempts QSR cover identity already written on the report", () => {
    const fact = extractHardFacts("Report number QSR/GLR/1301.")[0]!;
    expect(fact.kind).toBe("identifier");
    expect(
      isExemptFrameFact(fact, {
        reportMetadata: { equipmentCode: "QSR/GLR/1301" },
      })
    ).toBe(true);
  });
});

describe("isExplicitInsertRequest", () => {
  it("treats go-ahead and insert-that as keep-without-drop", () => {
    expect(isExplicitInsertRequest("go ahead and insert that")).toBe(true);
    expect(isExplicitInsertRequest("insert it")).toBe(true);
    expect(isExplicitInsertRequest("fill the effective date for URS")).toBe(
      true
    );
    expect(isExplicitInsertRequest("go ahead")).toBe(true);
  });

  it("does not treat a first-pass draft as an insert command", () => {
    expect(isExplicitInsertRequest("draft section 3")).toBe(false);
    expect(isExplicitInsertRequest("fill Table 3")).toBe(false);
  });
});

describe("shouldKeepUnsupportedFact", () => {
  it("keeps a date the engineer stated this turn", () => {
    const fact = extractHardFacts("30-06-2025").find(
      (row) => row.kind === "date"
    )!;
    expect(
      shouldKeepUnsupportedFact(fact, {
        latestUserMessageText: "use 30-06-2025 from the approval sheet",
        recentAssistantTexts: ["Ignore this assistant echo of 01-01-2099."],
      })
    ).toBe(true);
  });

  it("does not keep a number the prior assistant turn invented", () => {
    const fact = extractHardFacts("24.50 m²").find(
      (row) => row.kind === "number"
    )!;
    expect(fact.text).toContain("24.50");
    expect(
      shouldKeepUnsupportedFact(fact, {
        latestUserMessageText: "fill table 6 from the IQ",
        recentAssistantTexts: [
          "Heat transfer area is 24.50 m² [Installation Qualification.PDF, p. 24].",
        ],
      })
    ).toBe(false);
  });

  it("keeps every fact on an explicit go-ahead insert", () => {
    const fact = extractHardFacts("24.50 m²").find(
      (row) => row.kind === "number"
    )!;
    expect(
      shouldKeepUnsupportedFact(fact, {
        latestUserMessageText: "go ahead and insert that",
        recentAssistantTexts: [
          "Heat transfer area is 24.50 m² [Installation Qualification.PDF, p. 24].",
        ],
      })
    ).toBe(true);
  });

  it("does not keep an invented date absent from the user message", () => {
    const fact = extractHardFacts("01-01-2099").find(
      (row) => row.kind === "date"
    )!;
    expect(
      shouldKeepUnsupportedFact(fact, {
        latestUserMessageText: "draft the remaining sections",
        recentAssistantTexts: [
          "The URS approval sheet shows 30-06-2025.",
        ],
      })
    ).toBe(false);
  });
});

describe("operational volume columns", () => {
  it("treats considered volume and rinse sample quantity as floors", () => {
    expect(isOperationalVolumeColumnLabel("Considered volume")).toBe(true);
    expect(isOperationalVolumeColumnLabel("Rinse sample quantity")).toBe(true);
    expect(isOperationalVolumeColumnLabel("Rinse volume (L)")).toBe(true);
    expect(
      isOperationalVolumeColumnLabel("Rinse volume RF (L) SA × RF")
    ).toBe(false);
    expect(
      isOperationalVolumeColumnLabel("Rinse volume SAF (L) SA × SAF × SF")
    ).toBe(false);
    const fiveL = extractHardFacts("5 L").find((row) => row.kind === "number")!;
    expect(shouldKeepOperationalVolume(fiveL, "Considered volume")).toBe(true);
    expect(shouldKeepOperationalVolume(fiveL, "Capacity")).toBe(false);
  });

  it("does not treat PFR capacity as a considered rinse volume", () => {
    const fiveL = extractHardFacts("5 L").find((row) => row.kind === "number")!;
    expect(
      volumeSupportedForColumn(
        "Plug Flow Reactor PFR-1301 (5 L HAS). Micron Filter MF-1301 size 10\".",
        fiveL,
        "Considered volume"
      )
    ).toBe(false);
    expect(
      volumeSupportedForColumn(
        "MF-1301 micron filter considered rinse volume 5 L to flood the housing.",
        fiveL,
        "Considered volume"
      )
    ).toBe(true);
  });
});
