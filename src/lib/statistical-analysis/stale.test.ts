import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { applySampleAssay } from "./sample-data";
import { analysisListSubtitle, withLocalStale } from "./stale";
import {
  CAPABILITY_SIXPACK_NORMAL,
  MEASUREMENT_SCATTER,
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

  it("summarizes sixpack and scatter rows for the results list", () => {
    expect(analysisListSubtitle(sixpack())).toContain("Assay");
    expect(analysisListSubtitle(scatter())).toMatch(/M3-SYS-FN-037|10 point|ozf-in|limits/i);
  });
});
