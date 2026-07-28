import { describe, expect, it } from "vitest";
import {
  ANALYZE_METHOD_FIELDS,
  analyzeMethodPlan,
  detectAnalyzeMethod,
  existingAnalyzeTool,
  meaningfulAnalyzeText,
  methodFromToolsUsed,
  toolsUsedForMethod,
} from "@/lib/analyze/method";

function docWith(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("meaningfulAnalyzeText", () => {
  it("treats empty and Not Applicable as non-meaningful", () => {
    expect(meaningfulAnalyzeText("")).toBe(false);
    expect(meaningfulAnalyzeText("Not Applicable")).toBe(false);
    expect(meaningfulAnalyzeText("n/a")).toBe(false);
    expect(meaningfulAnalyzeText("Not Applicable.")).toBe(false);
  });

  it("accepts real content", () => {
    expect(meaningfulAnalyzeText("Operator training gap")).toBe(true);
    expect(meaningfulAnalyzeText(docWith("Why 1: seal failed"))).toBe(true);
  });
});

describe("detectAnalyzeMethod", () => {
  it("returns sixM when only 6M has content", () => {
    expect(
      detectAnalyzeMethod({
        sixM: { man: "Training lapse", machine: "Not Applicable" },
        fiveWhy: { narrative: docWith(""), conclusion: "" },
        brainstorming: "",
      })
    ).toBe("sixM");
  });

  it("returns fiveWhy when only 5-Why has content", () => {
    expect(
      detectAnalyzeMethod({
        sixM: { man: "Not Applicable" },
        fiveWhy: { narrative: docWith("Why 1: leak"), conclusion: "" },
        brainstorming: "Not Applicable",
      })
    ).toBe("fiveWhy");
  });

  it("returns brainstorming when only brainstorming has content", () => {
    expect(
      detectAnalyzeMethod({
        sixM: { man: "" },
        fiveWhy: { narrative: docWith(""), conclusion: "" },
        brainstorming: "Team listed three possible causes",
      })
    ).toBe("brainstorming");
  });

  it("returns null when empty", () => {
    expect(
      detectAnalyzeMethod({
        sixM: {},
        fiveWhy: { narrative: docWith(""), conclusion: "" },
        brainstorming: "",
      })
    ).toBeNull();
  });

  it("returns null when two methods are populated", () => {
    expect(
      detectAnalyzeMethod({
        sixM: { man: "Training" },
        fiveWhy: { narrative: docWith("Why 1"), conclusion: "" },
        brainstorming: "",
      })
    ).toBeNull();
  });
});

describe("existingAnalyzeTool", () => {
  it("returns sixM/fiveWhy only; brainstorming maps to null", () => {
    expect(
      existingAnalyzeTool({
        sixM: { man: "x" },
        fiveWhy: { narrative: docWith(""), conclusion: "" },
      })
    ).toBe("sixM");
    expect(
      existingAnalyzeTool({
        brainstorming: "ideas",
        sixM: {},
        fiveWhy: { narrative: docWith(""), conclusion: "" },
      })
    ).toBeNull();
  });
});

describe("analyzeMethodPlan", () => {
  it("partitions draft vs Not Applicable fields for each method", () => {
    const sixM = analyzeMethodPlan("sixM");
    expect(sixM.draftFields).toEqual(ANALYZE_METHOD_FIELDS.sixM);
    expect(sixM.notApplicableFields).toEqual([
      ...ANALYZE_METHOD_FIELDS.fiveWhy,
      ...ANALYZE_METHOD_FIELDS.brainstorming,
    ]);

    const fiveWhy = analyzeMethodPlan("fiveWhy");
    expect(fiveWhy.draftFields).toEqual(["fiveWhy.narrative"]);
    expect(fiveWhy.notApplicableFields).toContain("sixM.man");
    expect(fiveWhy.notApplicableFields).toContain("brainstorming");
    expect(fiveWhy.notApplicableFields).not.toContain("fiveWhy.narrative");

    const brainstorming = analyzeMethodPlan("brainstorming");
    expect(brainstorming.draftFields).toEqual(["brainstorming"]);
    expect(brainstorming.notApplicableFields).toEqual([
      ...ANALYZE_METHOD_FIELDS.sixM,
      ...ANALYZE_METHOD_FIELDS.fiveWhy,
    ]);
  });
});

describe("toolsUsedForMethod / methodFromToolsUsed", () => {
  it("round-trips a single selected method", () => {
    for (const method of ["sixM", "fiveWhy", "brainstorming"] as const) {
      const tools = toolsUsedForMethod(method);
      expect(methodFromToolsUsed(tools)).toBe(method);
      expect(Object.values(tools).filter(Boolean)).toHaveLength(1);
    }
  });

  it("returns null when zero or multiple checkboxes are set", () => {
    expect(
      methodFromToolsUsed({ sixM: false, fiveWhy: false, brainstorming: false })
    ).toBeNull();
    expect(
      methodFromToolsUsed({ sixM: true, fiveWhy: true, brainstorming: false })
    ).toBeNull();
  });
});
