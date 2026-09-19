import { describe, expect, it } from "vitest";
import {
  citationGroundingMode,
  citationGroundingRunsRepair,
  isExemptFrameFact,
} from "./citation-exemption";
import { extractHardFacts } from "./claim-facts";

describe("citationGroundingMode", () => {
  it("skips Purpose, Responsibilities, Abbreviations, and recap sections", () => {
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_objective",
        targetField: "narrative",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_responsibilities",
        targetField: "narrative",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_abbreviations",
        targetField: "table",
        tool: "edit_table",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_system_trends",
        targetField: "narrative",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_conclusion",
        targetField: "recommendationNarrative",
      })
    ).toBe("skip");
  });

  it("skips assessment narratives and investigation conclusion prose", () => {
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_csv_status",
        targetField: "narrative",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_media_fill",
        targetField: "narrative",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_risk_actions",
        targetField: "overallGrade",
      })
    ).toBe("skip");
    expect(
      citationGroundingMode({
        documentType: "investigation_report",
        section: "conclusion",
        targetField: "narrative",
      })
    ).toBe("skip");
  });

  it("frames Scope and Equipment description prose", () => {
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
        documentType: "equipment_lifecycle_report",
        section: "elr_system_description",
        targetField: "narrative",
      })
    ).toBe("frame");
  });

  it("keeps inventory and media-fill tables strict", () => {
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
        documentType: "equipment_lifecycle_report",
        section: "elr_media_fill",
        targetField: "table",
        tool: "edit_table",
      })
    ).toBe("strict");
    expect(
      citationGroundingMode({
        documentType: "equipment_lifecycle_report",
        section: "elr_qualification",
        targetField: "table",
        tool: "draft_field",
      })
    ).toBe("strict");
    expect(
      citationGroundingMode({
        documentType: "investigation_report",
        section: "define",
        targetField: "narrative",
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

  it("exempts title-page equipment IDs and Indian FY bounds", () => {
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

  it("does not exempt a mid-year event date or an invented batch", () => {
    const event = extractHardFacts("Calibrated 15 April 2024.")[0]!;
    expect(event.kind).toBe("date");
    expect(isExemptFrameFact(event, fySource)).toBe(false);

    const batch = extractHardFacts("Media fill MF-25-VIAL-01.")[0]!;
    expect(batch.kind).toBe("identifier");
    expect(isExemptFrameFact(batch, fySource)).toBe(false);
  });
});
