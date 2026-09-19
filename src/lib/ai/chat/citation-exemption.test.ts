import { describe, expect, it } from "vitest";
import {
  alreadyStatedHaystack,
  citationGroundingMode,
  citationGroundingRunsRepair,
  contentWithoutField,
  isExemptFrameFact,
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
        documentType: "equipment_lifecycle_report",
        section: "elr_qualification",
        targetField: "table",
        tool: "draft_field",
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
});
