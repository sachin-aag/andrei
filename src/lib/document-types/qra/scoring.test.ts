import { describe, expect, it } from "vitest";
import {
  computeRpn,
  formatComputedScore,
  initialRiskAcceptable,
  mitigationRequired,
  parseLevel,
  parseScore,
  residualRiskAcceptable,
  rpnBand,
  rprBand,
  RPR_COMBINATIONS,
  selectAssessmentMode,
  treatBeforeProceeding,
} from "./scoring";

describe("quantitative RPN", () => {
  it("multiplies S × P × D", () => {
    expect(computeRpn(1, 1, 1)).toBe(1);
    expect(computeRpn(5, 5, 5)).toBe(125);
    expect(computeRpn(2, 3, 4)).toBe(24);
  });

  it("rejects scores outside 1–5", () => {
    expect(() => computeRpn(0, 1, 1)).toThrow();
    expect(() => computeRpn(1, 6, 1)).toThrow();
    expect(() => computeRpn(1.5, 1, 1)).toThrow();
  });

  it("bands at the SOP boundaries 8 / 9 / 24 / 25", () => {
    expect(rpnBand(1)).toBe("low");
    expect(rpnBand(8)).toBe("low");
    expect(rpnBand(9)).toBe("medium");
    expect(rpnBand(24)).toBe("medium");
    expect(rpnBand(25)).toBe("high");
    expect(rpnBand(125)).toBe("high");
  });
});

describe("qualitative RPR lookup", () => {
  it("encodes every combination from Table 02", () => {
    expect(RPR_COMBINATIONS).toHaveLength(27);
    expect(rprBand("high", "low", "low")).toBe("low");
    expect(rprBand("high", "low", "medium")).toBe("medium");
    expect(rprBand("medium", "high", "medium")).toBe("high");
    expect(rprBand("medium", "medium", "high")).toBe("high");
    expect(rprBand("medium", "medium", "medium")).toBe("high");
    expect(rprBand("low", "high", "high")).toBe("high");
    expect(rprBand("low", "high", "medium")).toBe("medium");
    expect(rprBand("low", "medium", "medium")).toBe("medium");
    expect(rprBand("low", "low", "low")).toBe("low");
  });
});

describe("parsers", () => {
  it("parses integer scores on the 1–5 scale", () => {
    expect(parseScore("3")).toBe(3);
    expect(parseScore(" 5 ")).toBe(5);
    expect(parseScore("0")).toBeNull();
    expect(parseScore("6")).toBeNull();
    expect(parseScore("High")).toBeNull();
    expect(parseScore("")).toBeNull();
  });

  it("parses qualitative labels", () => {
    expect(parseLevel("High")).toBe("high");
    expect(parseLevel("MED")).toBe("medium");
    expect(parseLevel("l")).toBe("low");
    expect(parseLevel("4")).toBeNull();
  });
});

describe("A02 mode", () => {
  it("is qualitative only when every answer is yes", () => {
    expect(
      selectAssessmentMode({
        impactKnown: true,
        scopeDefined: true,
        scopeNarrow: true,
      })
    ).toBe("qualitative");
    expect(
      selectAssessmentMode({
        impactKnown: true,
        scopeDefined: true,
        scopeNarrow: false,
      })
    ).toBe("quantitative");
  });
});

describe("treatment", () => {
  it("requires mitigation for medium and high", () => {
    expect(mitigationRequired("low")).toBe(false);
    expect(mitigationRequired("medium")).toBe(true);
    expect(mitigationRequired("high")).toBe(true);
    expect(treatBeforeProceeding("high")).toBe(true);
    expect(treatBeforeProceeding("medium")).toBe(false);
  });

  it("accepts residual medium but not residual high", () => {
    expect(initialRiskAcceptable("low")).toBe(true);
    expect(initialRiskAcceptable("medium")).toBe(false);
    expect(residualRiskAcceptable("medium")).toBe(true);
    expect(residualRiskAcceptable("high")).toBe(false);
  });

  it("formats computed cells without inventing a number for RPR", () => {
    expect(formatComputedScore("quantitative", "medium", 12)).toBe(
      "12 (Medium)"
    );
    expect(formatComputedScore("qualitative", "high")).toBe("High");
  });
});
