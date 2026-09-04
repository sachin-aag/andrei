import { describe, expect, it } from "vitest";
import { chartBrandColors, seriesFill } from "@/lib/charts/brand-colors";

const SPEC_LIMIT_RED = "#dc2626";

describe("chartBrandColors", () => {
  it("uses hue-separated legend colors and never spec-limit red", () => {
    const colors = chartBrandColors("demo");
    expect(colors.series).toEqual([
      "#001838",
      "#d97706",
      "#0d9488",
      "#7c3aed",
      "#4d7c0f",
      "#db2777",
      "#075985",
      "#b45309",
    ]);
    expect(seriesFill(colors, 0)).toBe("#001838");
    expect(seriesFill(colors, 8)).toBe("#001838");
    expect(new Set(colors.series).size).toBe(colors.series.length);
    expect(colors.series.every((hex) => hex.toLowerCase() !== SPEC_LIMIT_RED)).toBe(
      true
    );
  });

  it("keeps pack series palettes distinct from a brand-blue ramp", () => {
    expect(chartBrandColors("mj").series.slice(0, 3)).toEqual([
      "#133782",
      "#d97706",
      "#0d9488",
    ]);
    expect(chartBrandColors("convergent").series.slice(0, 3)).toEqual([
      "#0079c1",
      "#d97706",
      "#15803d",
    ]);
    for (const packId of ["demo", "mj", "convergent"] as const) {
      const series = chartBrandColors(packId).series;
      expect(new Set(series).size).toBe(series.length);
      expect(series.every((hex) => hex.toLowerCase() !== SPEC_LIMIT_RED)).toBe(
        true
      );
    }
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
