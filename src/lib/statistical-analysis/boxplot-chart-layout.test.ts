import { describe, expect, it } from "vitest";
import {
  boxplotAxisLayout,
  BOXPLOT_CHART_HEIGHT,
  boxplotBoxWidth,
  boxplotExcelLayout,
  boxplotPlotWidth,
  rotatedInnerLabelBottomY,
  shouldRotateInnerLabels,
} from "./boxplot-chart-layout";

describe("boxplotAxisLayout", () => {
  it("rotates inner labels when serial numbers are long", () => {
    const groups = [
      { labels: ["924-10012"] },
      { labels: ["924-10017"] },
      { labels: ["924-10018"] },
    ];
    expect(shouldRotateInnerLabels(1, groups.length, 9)).toBe(true);
    const layout = boxplotAxisLayout(groups, 1);
    expect(layout.rotateInner).toBe(true);
    expect(
      rotatedInnerLabelBottomY(layout, "924-10012")
    ).toBeLessThanOrEqual(BOXPLOT_CHART_HEIGHT - 4);
  });

  it("keeps short labels on a compact band", () => {
    const groups = [{ labels: ["A"] }, { labels: ["B"] }];
    const layout = boxplotAxisLayout(groups, 1);
    expect(layout.rotateInner).toBe(false);
    expect(layout.innerBand).toBe(22);
    expect(layout.categoryLabelY(0)).toBe(layout.plotBottom + 16);
  });

  it("allocates outer bands below the inner category row", () => {
    const groups = [
      { labels: ["A123", "OP1"] },
      { labels: ["A124", "OP2"] },
    ];
    const layout = boxplotAxisLayout(groups, 2);
    expect(layout.categoryLabelY(1)).toBeGreaterThan(layout.categoryLabelY(0));
    expect(layout.categoryLabelY(1) + 12).toBeLessThanOrEqual(
      BOXPLOT_CHART_HEIGHT - 4
    );
  });
});

describe("boxplotExcelLayout", () => {
  it("keeps one or two boxes near the 42px cap with max gap and side pads", () => {
    const plotWidth = boxplotPlotWidth();
    expect(boxplotBoxWidth(1, plotWidth)).toBe(42);
    expect(boxplotBoxWidth(2, plotWidth)).toBe(42);

    const one = boxplotExcelLayout(1);
    expect(one.gapWidth).toBe(500);
    expect(one.padLeft).toBeGreaterThan(0);
    expect(one.padRight).toBe(one.padLeft);

    const two = boxplotExcelLayout(2);
    expect(two.gapWidth).toBe(500);
    expect(two.padLeft).toBeGreaterThan(0);
    expect(two.padRight).toBe(two.padLeft);

    const barFrac = 1 / (1 + 500 / 100);
    const oneShare = barFrac / (1 + one.padLeft + one.padRight);
    const appShare = 42 / plotWidth;
    expect(oneShare).toBeLessThan(0.08);
    expect(Math.abs(oneShare - appShare)).toBeLessThan(0.02);
  });

  it("uses a 55% slot and no pads when many groups already hit the cap", () => {
    const many = boxplotExcelLayout(12);
    expect(many.padLeft).toBe(0);
    expect(many.padRight).toBe(0);
    expect(many.gapWidth).toBe(82);
  });
});
