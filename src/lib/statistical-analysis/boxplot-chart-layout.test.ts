import { describe, expect, it } from "vitest";
import {
  boxplotAxisLayout,
  BOXPLOT_CHART_HEIGHT,
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
