import { describe, expect, it } from "vitest";
import {
  isInsertableGraphAnalysis,
  listInsertableGraphAnalyses,
} from "./insertable-graphs";
import type { StatisticalAnalysisSummary } from "./types";

const sixpack = {
  id: "a1",
  workspaceId: "ws",
  title: "Assay sixpack",
  kind: "capability_sixpack_normal",
  sourceHash: "h",
  stale: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  config: {
    columnId: "c1",
    columnName: "Assay",
    title: "Assay sixpack",
    lsl: 90,
    usl: 110,
    target: 100,
  },
  results: {} as never,
} satisfies StatisticalAnalysisSummary;

const scatter = {
  ...sixpack,
  id: "a2",
  title: "Torque scatter",
  kind: "measurement_scatter",
  config: {
    query: "torque",
    title: "Torque scatter",
    xLabel: "Unit",
    yLabel: "Torque",
    layout: { mode: "combined", seriesBy: "none", xAxis: "sequential", yRange: null },
    lsl: null,
    usl: null,
  },
  results: { specs: [], n: 0, uom: "Nm" },
} satisfies StatisticalAnalysisSummary;

const anova = {
  ...sixpack,
  id: "a3",
  title: "ANOVA",
  kind: "one_way_anova",
  config: {
    responseColumnId: "r",
    responseColumnName: "Response",
    factorColumnId: "f",
    factorColumnName: "Factor",
    title: "ANOVA",
  },
  results: {} as never,
} satisfies StatisticalAnalysisSummary;

describe("insertable-graphs", () => {
  it("includes sixpack and scatter analyses only", () => {
    expect(isInsertableGraphAnalysis(sixpack)).toBe(true);
    expect(isInsertableGraphAnalysis(scatter)).toBe(true);
    expect(isInsertableGraphAnalysis(anova)).toBe(false);
    expect(listInsertableGraphAnalyses([sixpack, scatter, anova])).toEqual([
      sixpack,
      scatter,
    ]);
  });
});
