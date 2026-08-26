import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { applySampleAssay } from "./sample-data";
import { analysisListSubtitle, withLocalStale } from "./stale";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  type AnovaAnalysisSummary,
  type ScatterAnalysisSummary,
  type SixpackAnalysisSummary,
} from "./types";
import { createEmptyWorksheet, setCell } from "./worksheet";

function sixpack(overrides?: Partial<SixpackAnalysisSummary>): SixpackAnalysisSummary {
  return {
    id: "an-six",
    workspaceId: "ws-1",
    kind: CAPABILITY_SIXPACK_NORMAL,
    title: "Assay",
    config: {
      columnId: "c1",
      columnName: "Assay",
      title: "Assay",
      lsl: 90,
      usl: 110,
      target: 100,
    },
    results: { n: 50 } as SixpackAnalysisSummary["results"],
    sourceHash: "abc",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function scatter(): ScatterAnalysisSummary {
  return {
    id: "an-scatter",
    workspaceId: "ws-1",
    kind: MEASUREMENT_SCATTER,
    title: "M3-SYS-FN-037",
    config: {
      query: "M3-SYS-FN-037",
      title: "M3-SYS-FN-037",
      xLabel: "Measurement",
      yLabel: "Torque (ozf-in)",
      layout: TORQUE_MOCK_SPEC.layout,
    },
    results: {
      specs: [TORQUE_MOCK_SPEC],
      n: TORQUE_MOCK_SPEC.points.length,
      uom: "ozf-in",
    },
    sourceHash: "def",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

function anova(): AnovaAnalysisSummary {
  return {
    id: "an-anova",
    workspaceId: "ws-1",
    kind: ONE_WAY_ANOVA,
    title: "Assay by Lot",
    config: {
      responseColumnId: "c1",
      responseColumnName: "Assay",
      factorColumnId: "c2",
      factorColumnName: "Lot",
      title: "Assay by Lot",
      alpha: 0.05,
    },
    results: {
      n: 50,
      skipped: 0,
      groupCount: 3,
      grandMean: 102,
      alpha: 0.05,
      table: {
        factor: { df: 2, ss: 1, ms: 0.5, f: 1, p: 0.4 },
        error: { df: 47, ss: 20, ms: 0.4 },
        total: { df: 49, ss: 21 },
      },
      rSquared: 0.05,
      groups: [],
      pairwise: [],
    },
    sourceHash: "anova",
    stale: false,
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

describe("analysis stale flags", () => {
  it("marks a sixpack stale when the analyzed column cells change locally", () => {
    const persisted = applySampleAssay(createEmptyWorksheet(), 0);
    const edited = setCell(persisted, 0, 0, "99.00");
    const [next] = withLocalStale([sixpack()], edited, persisted);
    expect(next?.stale).toBe(true);
  });

  it("does not mark a measurement scatter stale when the worksheet changes", () => {
    const persisted = applySampleAssay(createEmptyWorksheet(), 0);
    const edited = setCell(persisted, 0, 0, "99.00");
    const [next] = withLocalStale([scatter()], edited, persisted);
    expect(next?.stale).toBe(false);
  });

  it("marks ANOVA stale when the response or factor column changes", () => {
    const persisted = applySampleAssay(createEmptyWorksheet(), 0);
    const editedResponse = setCell(persisted, 0, 0, "99.00");
    const [staleResponse] = withLocalStale([anova()], editedResponse, persisted);
    expect(staleResponse?.stale).toBe(true);

    const editedFactor = setCell(persisted, 1, 0, "Z");
    const [staleFactor] = withLocalStale([anova()], editedFactor, persisted);
    expect(staleFactor?.stale).toBe(true);
  });

  it("summarizes sixpack, scatter, and ANOVA rows for the results list", () => {
    expect(analysisListSubtitle(sixpack())).toContain("Assay");
    expect(analysisListSubtitle(scatter())).toMatch(/M3-SYS-FN-037|10 point|ozf-in|limits/i);
    expect(analysisListSubtitle(anova())).toMatch(/Assay by Lot/i);
  });
});
