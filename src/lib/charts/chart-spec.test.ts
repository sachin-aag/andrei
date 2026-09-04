import { describe, expect, it } from "vitest";
import {
  applyAxisRangeOverride,
  DEFAULT_CHART_LAYOUT,
  formatChartCitationPages,
  formatChartProvenance,
  layoutPoints,
  layoutRangeFromBounds,
  parseChartSpec,
  resolveXRange,
  resolveYRange,
  splitSpec,
  uniqueChartCitations,
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

  it("defaults missing layout.mark to scatter", () => {
    const raw = spec();
    const { mark: _omitted, ...layoutWithoutMark } = raw.layout;
    expect(_omitted).toBe("scatter");
    expect(
      parseChartSpec({ ...raw, layout: layoutWithoutMark })?.layout.mark
    ).toBe("scatter");
  });

  it("does not inject xRange when the stored spec omitted it", () => {
    const raw = spec();
    const { xRange: _omitted, ...layoutWithoutXRange } = raw.layout;
    expect(_omitted).toBeNull();
    expect(
      parseChartSpec({ ...raw, layout: layoutWithoutXRange })?.layout.xRange
    ).toBeUndefined();
  });

  it("does not inject showMeanLine when the stored spec omitted it", () => {
    const raw = spec();
    const { showMeanLine: _omitted, ...layoutWithoutMeanLine } = raw.layout;
    expect(_omitted).toBeUndefined();
    expect(
      parseChartSpec({ ...raw, layout: layoutWithoutMeanLine })?.layout
        .showMeanLine
    ).toBeUndefined();
  });

  it("preserves showMeanLine when set", () => {
    expect(
      parseChartSpec(
        spec({ layout: { ...DEFAULT_CHART_LAYOUT, showMeanLine: true } })
      )?.layout.showMeanLine
    ).toBe(true);
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

  it("keeps numeric x for value axis", () => {
    const laid = layoutPoints(
      spec({
        points: [
          { x: 20.7, y: 0.17, series: null, label: "Row 1" },
          { x: 2369, y: 8, series: null, label: "Row 2" },
        ],
        layout: { ...DEFAULT_CHART_LAYOUT, xAxis: "value" },
      })
    );
    expect(laid.map((p) => p.x)).toEqual([20.7, 2369]);
  });
});

describe("resolveXRange", () => {
  it("uses the numeric x extent for value axis, not 1..N", () => {
    const range = resolveXRange(
      spec({
        points: [
          { x: 20.7, y: 1, series: null, label: "a" },
          { x: 2369, y: 2, series: null, label: "b" },
        ],
        layout: { ...DEFAULT_CHART_LAYOUT, xAxis: "value" },
      })
    );
    expect(range.min).toBeLessThan(20.7);
    expect(range.max).toBeGreaterThan(2369);
  });

  it("does not snap xmin to 0 when values sit far from the origin", () => {
    const range = resolveXRange(
      spec({
        points: [
          { x: 90, y: 1, series: null, label: "a" },
          { x: 110, y: 2, series: null, label: "b" },
        ],
        layout: { ...DEFAULT_CHART_LAYOUT, xAxis: "value" },
      })
    );
    expect(range.min).toBeGreaterThan(50);
    expect(range.max).toBeGreaterThan(110);
  });

  it("honors a full x-range override and a max-only override", () => {
    const valueLayout = { ...DEFAULT_CHART_LAYOUT, xAxis: "value" as const };
    const base = spec({
      points: [
        { x: 10, y: 1, series: null, label: "a" },
        { x: 20, y: 2, series: null, label: "b" },
      ],
      layout: valueLayout,
    });
    const auto = resolveXRange(base);
    expect(
      resolveXRange({
        ...base,
        layout: { ...valueLayout, xRange: { min: 0, max: 50 } },
      })
    ).toEqual({ min: 0, max: 50 });
    expect(
      resolveXRange({
        ...base,
        layout: { ...valueLayout, xRange: { min: null, max: 15 } },
      }).max
    ).toBe(15);
    expect(auto.max).toBeGreaterThan(15);
  });
});

describe("layoutRangeFromBounds", () => {
  it("returns null when both ends are auto", () => {
    expect(layoutRangeFromBounds(null, null)).toBeNull();
    expect(layoutRangeFromBounds(undefined, undefined)).toBeNull();
  });

  it("keeps a one-sided bound", () => {
    expect(layoutRangeFromBounds(0, null)).toEqual({ min: 0, max: null });
    expect(layoutRangeFromBounds(null, 10)).toEqual({ min: null, max: 10 });
  });
});

describe("applyAxisRangeOverride", () => {
  it("falls back to auto when the override is inverted", () => {
    expect(
      applyAxisRangeOverride({ min: 0, max: 10 }, { min: 8, max: 2 })
    ).toEqual({ min: 0, max: 10 });
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

  it("uses stacked totals for column charts with a legend", () => {
    const range = resolveYRange(
      spec({
        limits: { lower: null, upper: null },
        points: [
          { x: 1, y: 10, series: "A", label: "a" },
          { x: 1, y: 15, series: "B", label: "b" },
        ],
        layout: { ...DEFAULT_CHART_LAYOUT, mark: "column", seriesBy: "unit" },
      })
    );
    expect(range.max).toBeGreaterThanOrEqual(25);
  });

  it("ignores spec limits in the y-range when showSpecLimits is off", () => {
    const range = resolveYRange(
      spec({
        limits: { lower: 1, upper: 100 },
        points: [{ x: 1, y: 10, series: null, label: "a" }],
        layout: { ...DEFAULT_CHART_LAYOUT, showSpecLimits: false },
      })
    );
    expect(range.max).toBeLessThan(50);
  });

  it("honors a y-range override without changing auto when unset", () => {
    const auto = resolveYRange(spec({ limits: { lower: null, upper: null } }));
    expect(
      resolveYRange(
        spec({
          limits: { lower: null, upper: null },
          layout: { ...DEFAULT_CHART_LAYOUT, yRange: { min: -2, max: 12 } },
        })
      )
    ).toEqual({ min: -2, max: 12 });
    expect(auto).not.toEqual({ min: -2, max: 12 });
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
  it("summarizes count, limits, and query without page citations", () => {
    expect(formatChartProvenance(spec())).toBe(
      "4 points, limits 1–6 ozf-in, M3-SYS-FN-037"
    );
  });
});

describe("uniqueChartCitations", () => {
  it("deduplicates page and document-level citations and drops invalid pages", () => {
    expect(
      uniqueChartCitations([
        { attachmentId: "att_1", page: 31 },
        { attachmentId: " att_1 ", page: 31 },
        { attachmentId: "att_1", page: 32 },
        {
          attachmentId: "att_2",
          page: null,
          filename: " Mechanical report.pdf ",
        },
        { attachmentId: "", page: 1 },
        { attachmentId: "att_2", page: 0 },
      ])
    ).toEqual([
      { attachmentId: "att_1", page: 31 },
      { attachmentId: "att_1", page: 32 },
      {
        attachmentId: "att_2",
        page: null,
        filename: "Mechanical report.pdf",
      },
    ]);
  });
});

describe("formatChartCitationPages", () => {
  it("returns null when there are no citations", () => {
    expect(formatChartCitationPages([])).toBeNull();
    expect(
      formatChartCitationPages([
        {
          attachmentId: "att_1",
          page: null,
          filename: "Mechanical report.pdf",
        },
      ])
    ).toBeNull();
  });

  it("formats a page range", () => {
    expect(
      formatChartCitationPages([
        { attachmentId: "att_1", page: 15 },
        { attachmentId: "att_1", page: 13 },
      ])
    ).toBe("p. 13–15");
  });
});
