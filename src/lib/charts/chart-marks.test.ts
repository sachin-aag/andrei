import { describe, expect, it } from "vitest";
import {
  columnStacks,
  markGeometry,
  parseChartMark,
  seriesPolylines,
  stackedYExtent,
} from "./chart-marks";

describe("parseChartMark", () => {
  it("defaults unknown values to scatter", () => {
    expect(parseChartMark(undefined)).toBe("scatter");
    expect(parseChartMark("bar")).toBe("scatter");
    expect(parseChartMark("column")).toBe("column");
  });
});

describe("seriesPolylines", () => {
  it("groups by series and sorts by x", () => {
    const lines = seriesPolylines([
      { x: 2, y: 20, series: "B", label: "b2" },
      { x: 1, y: 10, series: "A", label: "a1" },
      { x: 3, y: 30, series: "A", label: "a3" },
    ]);
    expect(lines.map((line) => line.series)).toEqual(["B", "A"]);
    expect(lines[1]?.points.map((point) => point.x)).toEqual([1, 3]);
  });
});

describe("columnStacks", () => {
  it("draws one bar per x when not stacked", () => {
    const segments = columnStacks(
      [
        { x: 1, y: 10, series: null, label: "a" },
        { x: 2, y: 20, series: null, label: "b" },
      ],
      false
    );
    expect(segments).toEqual([
      { x: 1, series: "", y0: 0, y1: 10 },
      { x: 2, series: "", y0: 0, y1: 20 },
    ]);
  });

  it("stacks legend series at the same x", () => {
    const segments = columnStacks(
      [
        { x: 1, y: 10, series: "A", label: "a" },
        { x: 1, y: 5, series: "B", label: "b" },
        { x: 2, y: 3, series: "A", label: "a2" },
      ],
      true
    );
    expect(segments).toEqual([
      { x: 1, series: "A", y0: 0, y1: 10 },
      { x: 1, series: "B", y0: 10, y1: 15 },
      { x: 2, series: "A", y0: 0, y1: 3 },
    ]);
    expect(stackedYExtent([
      { x: 1, y: 10, series: "A", label: "a" },
      { x: 1, y: 5, series: "B", label: "b" },
    ])).toEqual({ min: 0, max: 15 });
  });
});

describe("markGeometry", () => {
  it("uses colored lines for line charts", () => {
    const geometry = markGeometry({
      mark: "line",
      seriesBy: "unit",
      points: [
        { x: 1, y: 1, series: "A", label: "a" },
        { x: 2, y: 2, series: "A", label: "a2" },
      ],
    });
    expect(geometry.type).toBe("polylines");
    if (geometry.type !== "polylines") return;
    expect(geometry.markers).toBe(false);
    expect(geometry.fill).toBe(false);
  });

  it("stacks columns when a legend is coloring series", () => {
    const geometry = markGeometry({
      mark: "column",
      seriesBy: "unit",
      points: [
        { x: 1, y: 2, series: "A", label: "a" },
        { x: 1, y: 3, series: "B", label: "b" },
      ],
    });
    expect(geometry.type).toBe("columns");
    if (geometry.type !== "columns") return;
    expect(geometry.segments).toHaveLength(2);
    expect(geometry.segments[1]?.y1).toBe(5);
  });
});
