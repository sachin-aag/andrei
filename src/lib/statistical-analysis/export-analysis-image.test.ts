import { describe, expect, it } from "vitest";
import { TORQUE_MOCK_SPEC } from "@/lib/charts/__fixtures__/torque-mock";
import { exportAnalysisImage } from "./export-analysis-image";
import type { StatisticalAnalysisSummary } from "./types";

const scatterAnalysis = {
  id: "scatter-1",
  workspaceId: "ws",
  title: "Torque",
  kind: "measurement_scatter",
  sourceHash: "hash",
  stale: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  config: {
    query: "torque",
    title: "Torque",
    xLabel: "Unit",
    yLabel: "Torque",
    layout: { mode: "combined", seriesBy: "none", xAxis: "sequential", yRange: null },
    lsl: null,
    usl: null,
  },
  results: {
    specs: [TORQUE_MOCK_SPEC],
    n: TORQUE_MOCK_SPEC.points.length,
    uom: "Nm",
  },
} satisfies StatisticalAnalysisSummary;

describe("exportAnalysisImage", () => {
  it("renders scatter analyses to a PNG data URL", async () => {
    const exported = await exportAnalysisImage(scatterAnalysis, { packId: "demo" });
    expect("error" in exported).toBe(false);
    if ("error" in exported) return;
    expect(exported.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(exported.alt).toBe(TORQUE_MOCK_SPEC.title);
    expect(exported.chartSpec?.title).toBe(TORQUE_MOCK_SPEC.title);
  });

  it("rejects unsupported analysis kinds", async () => {
    const exported = await exportAnalysisImage({
      ...scatterAnalysis,
      kind: "one_way_anova",
      config: {
        responseColumnId: "r",
        responseColumnName: "Response",
        factorColumnId: "f",
        factorColumnName: "Factor",
        title: "ANOVA",
      },
      results: {} as never,
    });
    expect(exported).toEqual({ error: "unsupported" });
  });
});
