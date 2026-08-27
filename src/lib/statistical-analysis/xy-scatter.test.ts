import { describe, expect, it } from "vitest";
import { applySampleAssay } from "./sample-data";
import {
  createEmptyWorksheet,
  pasteTsv,
  renameColumn,
  upsertSpecRow,
} from "./worksheet";
import { computeXyScatter, suggestXColumn } from "./xy-scatter";

describe("computeXyScatter", () => {
  it("pairs rows where both cells are numeric and skips NA pairs", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, ["1", "2", "na", "4"].join("\n"));
    sheet = pasteTsv(sheet, 1, 0, ["10", "20", "30", "40"].join("\n"));
    sheet = {
      ...sheet,
      columns: sheet.columns.map((column, index) =>
        index === 0
          ? { ...column, name: "Glucose" }
          : index === 1
            ? { ...column, name: "OD660" }
            : column
      ),
    };
    const outcome = computeXyScatter(sheet, {
      xColumnId: "c1",
      xColumnName: "Glucose",
      yColumnId: "c2",
      yColumnName: "OD660",
      title: "OD660 vs Glucose",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(3);
    expect(outcome.result.skipped).toBe(1);
    expect(outcome.result.specs[0]?.layout.xAxis).toBe("value");
    expect(outcome.result.specs[0]?.points.map((point) => point.x)).toEqual([
      1, 2, 4,
    ]);
    expect(outcome.result.specs[0]?.points.map((point) => point.y)).toEqual([
      10, 20, 40,
    ]);
    expect(outcome.result.specs[0]?.xLabel).toBe("Glucose");
    expect(outcome.result.specs[0]?.yLabel).toBe("OD660");
    expect(outcome.result.pearsonR).toBeCloseTo(1, 10);
  });

  it("requires distinct columns on the same sheet", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(
      computeXyScatter(sheet, {
        xColumnId: "c1",
        xColumnName: "Assay",
        yColumnId: "c1",
        yColumnName: "Assay",
        title: "same",
      }).ok
    ).toBe(false);
  });

  it("rejects fewer than two paired points", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, "1");
    sheet = pasteTsv(sheet, 1, 0, "2");
    const outcome = computeXyScatter(sheet, {
      xColumnId: "c1",
      xColumnName: "X",
      yColumnId: "c2",
      yColumnName: "Y",
      title: "tiny",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("too_few_points");
  });

  it("returns null Pearson r when X has zero variance", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, ["5", "5", "5"].join("\n"));
    sheet = pasteTsv(sheet, 1, 0, ["1", "2", "3"].join("\n"));
    const outcome = computeXyScatter(sheet, {
      xColumnId: "c1",
      xColumnName: "X",
      yColumnId: "c2",
      yColumnName: "Y",
      title: "flat x",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.pearsonR).toBeNull();
  });

  it("copies Y-column spec limits onto the chart", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, ["1", "2", "3"].join("\n"));
    sheet = pasteTsv(sheet, 1, 0, ["10", "20", "30"].join("\n"));
    sheet = renameColumn(sheet, 1, "OD660");
    sheet = upsertSpecRow(sheet, {
      columnName: "OD660",
      lsl: "5",
      usl: "40",
      target: "",
    });
    const outcome = computeXyScatter(sheet, {
      xColumnId: "c1",
      xColumnName: "C1",
      yColumnId: "c2",
      yColumnName: "OD660",
      title: "OD660 vs C1",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.specs[0]?.limits).toEqual({ lower: 5, upper: 40 });
  });

  it("suggests the next column as X", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(suggestXColumn(sheet, "c1")).toBe("c2");
  });

  it("does not force X min to 0", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 0, ["20.7", "100", "2369"].join("\n"));
    sheet = pasteTsv(sheet, 1, 0, ["0.17", "2", "8"].join("\n"));
    const outcome = computeXyScatter(sheet, {
      xColumnId: "c1",
      xColumnName: "Glucose",
      yColumnId: "c2",
      yColumnName: "OD660",
      title: "OD vs glucose",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const xs = outcome.result.specs[0]?.points.map((point) => point.x) ?? [];
    expect(Math.min(...xs)).toBe(20.7);
  });
});
