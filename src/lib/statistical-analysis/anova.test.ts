import { describe, expect, it } from "vitest";
import { computeOneWayAnova, suggestFactorColumn } from "./anova";
import { applySampleAssay } from "./sample-data";
import {
  addDataSheet,
  createEmptyWorksheet,
  pasteTsv,
  setCell,
} from "./worksheet";

function twoGroupSheet(): ReturnType<typeof createEmptyWorksheet> {
  let sheet = createEmptyWorksheet(2);
  sheet = pasteTsv(sheet, 0, 0, ["1", "2", "3", "4", "5", "6"].join("\n"));
  sheet = pasteTsv(sheet, 1, 0, ["A", "A", "A", "B", "B", "B"].join("\n"));
  return sheet;
}

describe("one-way ANOVA", () => {
  it("matches the hand-calculated two-group F=13.5 case", () => {
    const outcome = computeOneWayAnova(twoGroupSheet(), {
      responseColumnId: "c1",
      responseColumnName: "Y",
      factorColumnId: "c2",
      factorColumnName: "Group",
      title: "Y by Group",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const { table, groups, pairwise } = outcome.result;
    expect(table.factor.ss).toBeCloseTo(13.5, 10);
    expect(table.error.ss).toBeCloseTo(4, 10);
    expect(table.factor.df).toBe(1);
    expect(table.error.df).toBe(4);
    expect(table.factor.f).toBeCloseTo(13.5, 10);
    expect(table.factor.p).toBeLessThan(0.05);
    expect(table.factor.p).toBeGreaterThan(0.01);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.mean).toBeCloseTo(2, 10);
    expect(groups[1]?.mean).toBeCloseTo(5, 10);
    expect(pairwise).toHaveLength(1);
    expect(pairwise[0]?.diff).toBeCloseTo(-3, 10);
    expect(pairwise[0]?.pBonferroni).toBe(pairwise[0]?.pUnadjusted);
  });

  it("skips blank or non-numeric pairs and requires two groups", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = setCell(sheet, 0, 0, "1");
    sheet = setCell(sheet, 1, 0, "A");
    sheet = setCell(sheet, 0, 1, "x");
    sheet = setCell(sheet, 1, 1, "A");
    const tooFew = computeOneWayAnova(sheet, {
      responseColumnId: "c1",
      responseColumnName: "Y",
      factorColumnId: "c2",
      factorColumnName: "Group",
      title: "Y by Group",
    });
    expect(tooFew.ok).toBe(false);
    if (tooFew.ok) return;
    expect(tooFew.code).toBe("too_few_groups");
  });

  it("rejects response and factor on different sheets", () => {
    let sheet = applySampleAssay(createEmptyWorksheet(), 0);
    sheet = addDataSheet(sheet);
    const otherId = sheet.columns[0]?.id;
    expect(otherId).toBeTruthy();
    const outcome = computeOneWayAnova(sheet, {
      responseColumnId: "c1",
      responseColumnName: "Assay",
      factorColumnId: otherId!,
      factorColumnName: "Other",
      title: "cross sheet",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("different_sheets");
  });

  it("returns F=infinity when groups have no within-group variance", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, ["1", "1", "5", "5"].join("\n"));
    sheet = pasteTsv(sheet, 1, 0, ["A", "A", "B", "B"].join("\n"));
    const outcome = computeOneWayAnova(sheet, {
      responseColumnId: "c1",
      responseColumnName: "Y",
      factorColumnId: "c2",
      factorColumnName: "G",
      title: "perfect",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.table.factor.f).toBe(Number.POSITIVE_INFINITY);
    expect(outcome.result.table.factor.p).toBe(0);
  });

  it("suggests the next column as the factor", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(suggestFactorColumn(sheet, "c1")).toBe("c2");
  });
});
