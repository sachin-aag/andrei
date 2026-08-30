import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import {
  isInsertableGraphAnalysis,
  listGraphAnalyses,
  listInsertableGraphAnalyses,
} from "./insertable-graphs";
import type { StatisticalAnalysisSummary } from "./types";

const previewImage = {
  dataUrl: "data:image/png;base64,AAAA",
  widthPx: 600,
  heightPx: 400,
  alt: "Assay sixpack",
  chartSpec: null,
};

const sixpack = {
  id: "a1",
  workspaceId: "ws",
  title: "Assay sixpack",
  kind: "capability_sixpack_normal",
  sourceHash: "h",
  stale: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  previewImage,
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
  previewImage: {
    ...previewImage,
    alt: "Torque scatter",
    chartSpec: TORQUE_MOCK_SPEC,
  },
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
  previewImage: null,
  config: {
    responseColumnId: "r",
    responseColumnName: "Response",
    factorColumnId: "f",
    factorColumnName: "Factor",
    title: "ANOVA",
  },
  results: {} as never,
} satisfies StatisticalAnalysisSummary;

const boxplot = {
  ...sixpack,
  id: "a5",
  title: "Boxplot of Assay",
  kind: "boxplot",
  previewImage,
  config: {
    yColumnId: "c1",
    yColumnName: "Assay",
    categoryColumnIds: ["c2"],
    categoryColumnNames: ["Lot"],
    title: "Boxplot of Assay by Lot",
  },
  results: { n: 10, skipped: 0, groups: [] },
} satisfies StatisticalAnalysisSummary;

const legacySixpack = {
  ...sixpack,
  id: "a4",
  previewImage: null,
};

describe("insertable-graphs", () => {
  it("includes graph analyses with a stored preview only", () => {
    expect(isInsertableGraphAnalysis(sixpack)).toBe(true);
    expect(isInsertableGraphAnalysis(scatter)).toBe(true);
    expect(isInsertableGraphAnalysis(boxplot)).toBe(true);
    expect(isInsertableGraphAnalysis(anova)).toBe(false);
    expect(isInsertableGraphAnalysis(legacySixpack)).toBe(false);
    expect(
      listInsertableGraphAnalyses([sixpack, scatter, boxplot, anova, legacySixpack])
    ).toEqual([sixpack, scatter, boxplot]);
    expect(
      listGraphAnalyses([sixpack, scatter, boxplot, anova, legacySixpack])
    ).toEqual([sixpack, scatter, boxplot, legacySixpack]);
  });
});
