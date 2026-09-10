import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  chartBrandColors,
  seriesFill,
  type ChartBrandColors,
} from "@/lib/charts/brand-colors";
import type { CustomerId } from "@/lib/customers/resolve";

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

describe("palette agrees with the CSS ramp", () => {
  const css = readFileSync(
    join(process.cwd(), "src/app/globals.css"),
    "utf8"
  );

  function block(selector: string): Record<string, string> {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`no ${selector} block in globals.css`);
    const end = css.indexOf("\n}", start);
    const tokens: Record<string, string> = {};
    for (const match of css
      .slice(start, end)
      .matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      tokens[match[1]!] = match[2]!.toLowerCase();
    }
    return tokens;
  }

  const root = block(":root");
  const byPack: Record<CustomerId, Record<string, string>> = {
    demo: root,
    mj: { ...root, ...block('html[data-customer="mj"]') },
    convergent: { ...root, ...block('html[data-customer="convergent"]') },
  };

  // The SVG views style from these CSS tokens; the Excel export styles from the
  // TS palette. They must not drift.
  const pairs: Array<[keyof ChartBrandColors, string]> = [
    ["brand100", "brand-100"],
    ["brand200", "brand-200"],
    ["brand400", "brand-400"],
    ["brand500", "brand-500"],
    ["brand600", "brand-600"],
    ["brand800", "brand-800"],
    ["foreground", "foreground"],
    ["axis", "muted-foreground"],
    ["grid", "border"],
  ];

  it.each(Object.keys(byPack) as CustomerId[])("matches %s", (pack) => {
    const colors = chartBrandColors(pack);
    for (const [key, token] of pairs) {
      expect(`${pack}.${key}=${String(colors[key]).toLowerCase()}`).toBe(
        `${pack}.${key}=${byPack[pack][token]}`
      );
    }
  });
});
