import { describe, expect, it } from "vitest";
import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";

describe("chartBrandColors", () => {
  it("cycles brand 600/500/400 and never uses red for series", () => {
    const colors = chartBrandColors("demo");
    expect(colors.series).toEqual(["#001838", "#3d6fb5", "#5b8ad0"]);
    expect(seriesFill(colors, 0)).toBe("#001838");
    expect(seriesFill(colors, 3)).toBe("#001838");
    expect(colors.series.every((hex) => hex.toLowerCase() !== "#dc2626")).toBe(true);
  });

  it("keeps limit lines red in every pack", () => {
    expect(chartBrandColors("demo").limit).toBe("#dc2626");
    expect(chartBrandColors("mj").limit).toBe("#dc2626");
    expect(chartBrandColors("convergent").limit).toBe("#dc2626");
  });

  it("uses pack brand-800 for axis/title text", () => {
    expect(chartBrandColors("demo").brand800).toBe("#061528");
    expect(chartBrandColors("mj").brand800).toBe("#13122e");
    expect(chartBrandColors("convergent").brand800).toBe("#043e64");
  });
});
