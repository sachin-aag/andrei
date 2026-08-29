import { describe, expect, it } from "vitest";
import { FMEA_COLUMN_SCHEMA } from "./matrix-columns";
import {
  DEFAULT_FMEA_STAGE,
  FMEA_STAGES,
  fmeaHiddenNthChildren,
  fmeaVisibleColumnIds,
  isFmeaStage,
} from "./fmea-stages";

describe("FMEA stage column groups", () => {
  it("keeps the SOP column order at 19 so CSS nth-child rules stay valid", () => {
    expect(FMEA_COLUMN_SCHEMA).toHaveLength(19);
    expect(FMEA_COLUMN_SCHEMA.map((col) => col.id)).toEqual([
      "riskId",
      "process",
      "failure",
      "cause",
      "effect",
      "severity",
      "controls",
      "probability",
      "detectionMeasures",
      "detectability",
      "rpn",
      "acceptable",
      "mitigation",
      "responsibility",
      "revisedSeverity",
      "revisedProbability",
      "revisedDetectability",
      "finalRpn",
      "finalAcceptable",
    ]);
  });

  it("defaults to identification", () => {
    expect(DEFAULT_FMEA_STAGE).toBe("identification");
    expect(isFmeaStage("identification")).toBe(true);
    expect(isFmeaStage("unknown")).toBe(false);
  });

  it("always includes identity columns except in All", () => {
    for (const stage of FMEA_STAGES) {
      if (stage === "all") continue;
      expect(fmeaVisibleColumnIds(stage).slice(0, 3)).toEqual([
        "riskId",
        "process",
        "failure",
      ]);
    }
  });

  it("hides scoring-through-residual columns in identification", () => {
    expect(fmeaHiddenNthChildren("identification")).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("hides cause, effect, and post-scoring columns in scoring", () => {
    expect(fmeaHiddenNthChildren("scoring")).toEqual([
      4, 5, 13, 14, 15, 16, 17, 18, 19,
    ]);
  });

  it("hides non-mitigation work columns in mitigation", () => {
    expect(fmeaHiddenNthChildren("mitigation")).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19,
    ]);
  });

  it("hides pre-residual work columns in residual", () => {
    expect(fmeaHiddenNthChildren("residual")).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it("hides nothing in All columns", () => {
    expect(fmeaHiddenNthChildren("all")).toEqual([]);
    expect(fmeaVisibleColumnIds("all")).toHaveLength(FMEA_COLUMN_SCHEMA.length);
  });
});
