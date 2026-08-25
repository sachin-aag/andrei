import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHART_LAYOUT,
  formatChartProvenance,
  layoutPoints,
  parseChartSpec,
  resolveYRange,
  splitSpec,
  type ChartSpec,
} from "@/lib/charts/chart-spec";

function spec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    version: 1,
    kind: "scatter",
    query: "M3-SYS-FN-037",
    title: "Tip Detachment Torque",
    xLabel: "Measurement",
    yLabel: "Torque (ozf-in)",
    uom: "ozf-in",
    limits: { lower: 1, upper: 6 },
    points: [
      { x: 0, y: 3, series: "B", label: "B Tip 2" },
      { x: 0, y: 2.5, series: "A", label: "A Tip 1" },
      { x: 0, y: 4, series: "A", label: "A Tip 2" },
      { x: 0, y: 5, series: "B", label: "B Tip 1" },
    ],
    layout: { ...DEFAULT_CHART_LAYOUT },
    citations: [{ attachmentId: "att_1", page: 13 }],
    sampleSizeMin: 29,
    ...overrides,
  };
}

describe("parseChartSpec", () => {
  it("accepts a valid spec", () => {
    expect(parseChartSpec(spec())?.query).toBe("M3-SYS-FN-037");
  });

  it("rejects an unknown kind", () => {
    expect(parseChartSpec({ ...spec(), kind: "bar" })).toBeNull();
  });

  it("rejects a missing query", () => {
    expect(parseChartSpec({ ...spec(), query: "" })).toBeNull();
  });
});

describe("layoutPoints", () => {
  it("is deterministic", () => {
    const input = spec();
    expect(layoutPoints(input)).toEqual(layoutPoints(input));
  });

  it("numbers 1..N across series for sequential x", () => {
    const laid = layoutPoints(spec({ layout: { ...DEFAULT_CHART_LAYOUT, xAxis: "sequential" } }));
    expect(laid.map((p) => ({ series: p.series, label: p.label, x: p.x }))).toEqual([
      { series: "A", label: "A Tip 1", x: 1 },
      { series: "A", label: "A Tip 2", x: 2 },
      { series: "B", label: "B Tip 1", x: 3 },
      { series: "B", label: "B Tip 2", x: 4 },
    ]);
  });

  it("orders Tip 10 after Tip 2", () => {
    const laid = layoutPoints(
      spec({
        points: [
          { x: 0, y: 1, series: null, label: "Tip 10" },
          { x: 0, y: 1, series: null, label: "Tip 2" },
          { x: 0, y: 1, series: null, label: "Tip 1" },
        ],
      })
    );
    expect(laid.map((p) => p.label)).toEqual(["Tip 1", "Tip 2", "Tip 10"]);
  });

  it("restarts numbering per series for replicate x", () => {
    const laid = layoutPoints(spec({ layout: { ...DEFAULT_CHART_LAYOUT, xAxis: "replicate" } }));
    expect(laid.map((p) => ({ series: p.series, label: p.label, x: p.x }))).toEqual([
      { series: "A", label: "A Tip 1", x: 1 },
      { series: "A", label: "A Tip 2", x: 2 },
      { series: "B", label: "B Tip 1", x: 1 },
      { series: "B", label: "B Tip 2", x: 2 },
    ]);
  });
});

describe("resolveYRange", () => {
  it("includes both limits even when data is far inside them", () => {
    const range = resolveYRange(spec());
    expect(range.min).toBe(0);
    expect(range.max).toBeGreaterThanOrEqual(6);
  });

  it("uses 0 as ymin when data and limits are non-negative", () => {
    expect(resolveYRange(spec({ limits: { lower: 2, upper: 4 } })).min).toBe(0);
  });
});

describe("splitSpec", () => {
  it("yields one spec per series, keeping limits and suffixing the title", () => {
    const parts = splitSpec(spec({ layout: { ...DEFAULT_CHART_LAYOUT, mode: "per-series" } }));
    expect(parts).toHaveLength(2);
    expect(parts[0]!.title).toBe("Tip Detachment Torque — A");
    expect(parts[1]!.title).toBe("Tip Detachment Torque — B");
    expect(parts[0]!.limits).toEqual({ lower: 1, upper: 6 });
    expect(parts[0]!.points).toHaveLength(2);
    expect(parts[1]!.points).toHaveLength(2);
  });
});

describe("formatChartProvenance", () => {
  it("summarizes count, limits, query, and pages", () => {
    expect(formatChartProvenance(spec())).toBe(
      "4 points, limits 1–6 ozf-in, M3-SYS-FN-037, p. 13"
    );
  });
});
