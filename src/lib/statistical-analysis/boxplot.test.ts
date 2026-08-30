import { describe, expect, it } from "vitest";
import {
  computeBoxplot,
  nestedCategorySpans,
  quantileType7,
  suggestCategoryColumn,
  tukeyBoxStats,
} from "./boxplot";
import { applySampleAssay } from "./sample-data";
import { BLANK_LEGEND_LABEL } from "./types";
import {
  addDataSheet,
  createEmptyWorksheet,
  insertColumn,
  pasteTsv,
  renameColumn,
  setCell,
} from "./worksheet";

function nestedSheet(): ReturnType<typeof createEmptyWorksheet> {
  let sheet = createEmptyWorksheet(4);
  sheet = renameColumn(sheet, 0, "Assay");
  sheet = renameColumn(sheet, 1, "Operator");
  sheet = renameColumn(sheet, 2, "Run");
  sheet = renameColumn(sheet, 3, "Batch");
  // Interleaved batches so first-seen combination order would split A123
  // unless we nest-sort outermost-first.
  sheet = pasteTsv(sheet, 0, 0, ["10", "20", "30", "11", "21", "31"].join("\n"));
  sheet = pasteTsv(
    sheet,
    1,
    0,
    ["OP1", "OP2", "OP1", "OP1", "OP2", "OP1"].join("\n")
  );
  sheet = pasteTsv(
    sheet,
    2,
    0,
    ["Beginning", "Middle", "Beginning", "End", "Middle", "End"].join("\n")
  );
  sheet = pasteTsv(
    sheet,
    3,
    0,
    ["A123", "A123", "A124", "A123", "A124", "A124"].join("\n")
  );
  return sheet;
}

describe("boxplot quartiles and Tukey fences", () => {
  it("matches R type 7 / Excel QUARTILE.INC on 1..10", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(quantileType7(sorted, 0.25)).toBeCloseTo(3.25, 10);
    expect(quantileType7(sorted, 0.5)).toBeCloseTo(5.5, 10);
    expect(quantileType7(sorted, 0.75)).toBeCloseTo(7.75, 10);
  });

  it("marks Tukey outliers beyond 1.5 IQR and keeps whiskers at last inliers", () => {
    const stats = tukeyBoxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    expect(stats.q1).toBeCloseTo(3.25, 10);
    expect(stats.q3).toBeCloseTo(7.75, 10);
    expect(stats.whiskerHigh).toBe(9);
    expect(stats.outliers).toEqual([100]);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(100);
  });

  it("draws a degenerate box for a single point", () => {
    const stats = tukeyBoxStats([42]);
    expect(stats).toMatchObject({
      n: 1,
      min: 42,
      q1: 42,
      median: 42,
      q3: 42,
      max: 42,
      whiskerLow: 42,
      whiskerHigh: 42,
      outliers: [],
    });
  });
});

describe("computeBoxplot", () => {
  it("draws one box of all Y when there are no category columns", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = pasteTsv(sheet, 0, 0, ["1", "2", "3", "4"].join("\n"));
    const outcome = computeBoxplot(sheet, {
      yColumnId: "c1",
      yColumnName: "Assay",
      categoryColumnIds: [],
      categoryColumnNames: [],
      title: "Boxplot of Assay",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.groups).toHaveLength(1);
    expect(outcome.result.groups[0]?.labels).toEqual([]);
    expect(outcome.result.n).toBe(4);
    expect(outcome.result.groups[0]?.median).toBeCloseTo(2.5, 10);
  });

  it("groups observed combinations and nest-sorts outermost first", () => {
    const outcome = computeBoxplot(nestedSheet(), {
      yColumnId: "c1",
      yColumnName: "Assay",
      categoryColumnIds: ["c2", "c3", "c4"],
      categoryColumnNames: ["Operator", "Run", "Batch"],
      title: "Boxplot of Assay by Operator, Run, Batch",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const labels = outcome.result.groups.map((group) => group.labels.join("/"));
    expect(labels).toEqual([
      "OP1/Beginning/A123",
      "OP2/Middle/A123",
      "OP1/End/A123",
      "OP1/Beginning/A124",
      "OP2/Middle/A124",
      "OP1/End/A124",
    ]);
    const batchSpans = nestedCategorySpans(outcome.result.groups, 2);
    expect(batchSpans).toEqual([
      { label: "A123", startIndex: 0, count: 3 },
      { label: "A124", startIndex: 3, count: 3 },
    ]);
  });

  it("uses (blank) for empty category cells and skips non-numeric Y", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = setCell(sheet, 0, 0, "1");
    sheet = setCell(sheet, 1, 0, "");
    sheet = setCell(sheet, 0, 1, "x");
    sheet = setCell(sheet, 1, 1, "A");
    sheet = setCell(sheet, 0, 2, "3");
    sheet = setCell(sheet, 1, 2, "A");
    const outcome = computeBoxplot(sheet, {
      yColumnId: "c1",
      yColumnName: "Y",
      categoryColumnIds: ["c2"],
      categoryColumnNames: ["Lot"],
      title: "Y by Lot",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.skipped).toBe(1);
    expect(outcome.result.groups.map((group) => group.labels[0])).toEqual([
      BLANK_LEGEND_LABEL,
      "A",
    ]);
  });

  it("rejects Y reused as a category, different sheets, and no numeric Y", () => {
    const same = computeBoxplot(createEmptyWorksheet(1), {
      yColumnId: "c1",
      yColumnName: "Y",
      categoryColumnIds: ["c1"],
      categoryColumnNames: ["Y"],
      title: "bad",
    });
    expect(same.ok).toBe(false);
    if (same.ok) return;
    expect(same.code).toBe("same_column");

    let sheet = applySampleAssay(createEmptyWorksheet(), 0);
    sheet = addDataSheet(sheet);
    const otherId = sheet.columns[0]?.id;
    const cross = computeBoxplot(sheet, {
      yColumnId: "c1",
      yColumnName: "Assay",
      categoryColumnIds: [otherId!],
      categoryColumnNames: ["Other"],
      title: "cross",
    });
    expect(cross.ok).toBe(false);
    if (cross.ok) return;
    expect(cross.code).toBe("different_sheets");

    const empty = computeBoxplot(createEmptyWorksheet(1), {
      yColumnId: "c1",
      yColumnName: "Y",
      categoryColumnIds: [],
      categoryColumnNames: [],
      title: "empty",
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.code).toBe("too_few_values");
  });

  it("caps the number of observed groups", () => {
    let sheet = createEmptyWorksheet(2);
    const y: string[] = [];
    const factor: string[] = [];
    for (let i = 0; i < 81; i++) {
      y.push(String(i));
      factor.push(`G${i}`);
    }
    sheet = pasteTsv(sheet, 0, 0, y.join("\n"));
    sheet = pasteTsv(sheet, 1, 0, factor.join("\n"));
    const outcome = computeBoxplot(sheet, {
      yColumnId: "c1",
      yColumnName: "Y",
      categoryColumnIds: ["c2"],
      categoryColumnNames: ["G"],
      title: "too many",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("too_many_groups");
  });

  it("suggests the next unused column as a category", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(2), 0);
    expect(suggestCategoryColumn(sheet, "c1")).toBe("c2");
    expect(suggestCategoryColumn(sheet, "c1", ["c2"])).toBeNull();
    const wider = insertColumn(sheet, 2);
    expect(suggestCategoryColumn(wider, "c1", ["c2"])).toBe("c3");
  });
});
