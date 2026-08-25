import {
  DEFAULT_CHART_LAYOUT,
  type ChartSpec,
} from "@/lib/charts/chart-spec";

/**
 * Mock values chosen for visual review of the renderer — not 825-00101 data.
 * The real appendix is 30 points on quarter/half increments (see
 * `m3-sys-fn-037-transcript.ts`). `citations: []` is permitted only here.
 */
export const TORQUE_MOCK_VALUES = [
  3.1, 4.1, 3.3, 4.1, 4.6, 2.3, 3.6, 3.4, 4.1, 3.9,
] as const;

export const TORQUE_MOCK_SPEC: ChartSpec = {
  version: 1,
  kind: "scatter",
  query: "mock-torque",
  title: "Tip Detachment Torque",
  xLabel: "Measurement",
  yLabel: "Torque (ozf-in)",
  uom: "ozf-in",
  limits: { lower: 1, upper: 6 },
  points: TORQUE_MOCK_VALUES.map((y, index) => ({
    x: index + 1,
    y,
    series: null,
    label: `Tip ${index + 1}`,
  })),
  layout: { ...DEFAULT_CHART_LAYOUT, seriesBy: "none" },
  citations: [],
  sampleSizeMin: null,
};
