import { describe, expect, it } from "vitest";
import {
  analyzePlotTypeHelpText,
  isAnalyzeInlinePlotKind,
  WORKSHEET_PLOT_CATALOG,
  worksheetPlotEntry,
} from "./plot-catalog";
import {
  BOXPLOT,
  CAPABILITY_SIXPACK_NORMAL,
  HISTOGRAM,
  MEASUREMENT_SCATTER,
  ONE_WAY_ANOVA,
  XY_SCATTER,
} from "./types";

describe("WORKSHEET_PLOT_CATALOG", () => {
  it("lists every worksheet plot once, in Plot-menu order", () => {
    expect(WORKSHEET_PLOT_CATALOG.map((item) => item.kind)).toEqual([
      CAPABILITY_SIXPACK_NORMAL,
      HISTOGRAM,
      ONE_WAY_ANOVA,
      BOXPLOT,
      XY_SCATTER,
    ]);
    expect(
      WORKSHEET_PLOT_CATALOG.map((item) => item.kind)
    ).not.toContain(MEASUREMENT_SCATTER);
    expect(new Set(WORKSHEET_PLOT_CATALOG.map((item) => item.menuTestId)).size).toBe(
      WORKSHEET_PLOT_CATALOG.length
    );
  });

  it("keeps sixpack and ANOVA inline in Analyze data", () => {
    expect(isAnalyzeInlinePlotKind(CAPABILITY_SIXPACK_NORMAL)).toBe(true);
    expect(isAnalyzeInlinePlotKind(ONE_WAY_ANOVA)).toBe(true);
    expect(isAnalyzeInlinePlotKind(HISTOGRAM)).toBe(false);
    expect(isAnalyzeInlinePlotKind(BOXPLOT)).toBe(false);
    expect(isAnalyzeInlinePlotKind(XY_SCATTER)).toBe(false);
    expect(worksheetPlotEntry(XY_SCATTER).label).toBe("Plot measurements");
    for (const item of WORKSHEET_PLOT_CATALOG.filter((entry) => !entry.analyzeInline)) {
      expect(analyzePlotTypeHelpText()).toContain(item.label);
    }
  });
});
