import { describe, expect, it } from "vitest";
import { applySampleAssay } from "./sample-data";
import {
  analysisSourceKey,
  columnNumericValues,
  columnSourceKey,
  createEmptyWorksheet,
  deleteColumn,
  findColumnIndexByName,
  insertColumn,
  parseTsv,
  pasteTsv,
  replaceColumnValues,
  rowCount,
  setCell,
  trimTrailingEmpty,
} from "./worksheet";

describe("worksheet grid operations", () => {
  it("starts with C1–C8 empty columns", () => {
    const sheet = createEmptyWorksheet();
    expect(sheet.columns).toHaveLength(8);
    expect(sheet.columns[0]?.name).toBe("C1");
    expect(sheet.columns[7]?.name).toBe("C8");
    expect(rowCount(sheet)).toBe(0);
  });

  it("parses a numeric subset of rows without using the rest of the column", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = setCell(sheet, 0, 0, "10");
    sheet = setCell(sheet, 0, 1, "11");
    sheet = setCell(sheet, 0, 2, "skip");
    sheet = setCell(sheet, 0, 3, "13");
    sheet = setCell(sheet, 0, 4, "14");
    expect(
      columnNumericValues(sheet.columns[0]!, {
        mode: "range",
        start: 2,
        end: 4,
      })
    ).toEqual({ values: [11, 13], skipped: 1 });
    expect(
      columnNumericValues(sheet.columns[0]!, { mode: "rows", rows: [1, 5] })
    ).toEqual({ values: [10, 14], skipped: 0 });
    expect(analysisSourceKey(sheet.columns[0]!)).toBe(
      JSON.stringify(["10", "11", "skip", "13", "14"])
    );
    expect(
      analysisSourceKey(sheet.columns[0]!, { mode: "range", start: 1, end: 2 })
    ).toBe(JSON.stringify(["10", "11"]));
  });

  it("sets, trims, and parses numeric cells including percents", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = setCell(sheet, 0, 0, "101.2%");
    sheet = setCell(sheet, 0, 1, "102.5");
    sheet = setCell(sheet, 0, 2, "not a number");
    sheet = setCell(sheet, 0, 5, "");
    expect(trimTrailingEmpty(sheet.columns[0]!.values)).toEqual([
      "101.2%",
      "102.5",
      "not a number",
    ]);
    expect(columnNumericValues(sheet.columns[0]!)).toEqual({
      values: [101.2, 102.5],
      skipped: 1,
    });
  });

  it("pastes TSV from a selected origin cell", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = pasteTsv(sheet, 0, 1, "10\t20\n30\t40\n");
    expect(sheet.columns[0]?.values).toEqual(["", "10", "30"]);
    expect(sheet.columns[1]?.values).toEqual(["", "20", "40"]);
  });

  it("parses tabs and newlines the way Excel paste sends them", () => {
    expect(parseTsv("a\tb\nc")).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("inserts and deletes columns without dropping the last one", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = insertColumn(sheet, 1);
    expect(sheet.columns.map((column) => column.name)).toEqual(["C1", "C3", "C2"]);
    sheet = deleteColumn(sheet, 1);
    expect(sheet.columns.map((column) => column.name)).toEqual(["C1", "C2"]);
    sheet = deleteColumn(sheet, 0);
    sheet = deleteColumn(sheet, 0);
    expect(sheet.columns).toHaveLength(1);
  });

  it("replaces a column and reports a stable source key", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = setCell(sheet, 0, 0, "10");
    sheet = setCell(sheet, 0, 1, "11");
    expect(columnSourceKey(sheet.columns[0]!)).toBe(JSON.stringify(["10", "11"]));
    sheet = replaceColumnValues(sheet, 0, ["1", "2", "3"], "Assay");
    expect(sheet.columns[0]?.name).toBe("Assay");
    expect(sheet.columns[0]?.values).toEqual(["1", "2", "3"]);
  });

  it("loads the sample assay column", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(1), 0);
    expect(sheet.columns[0]?.name).toBe("Assay");
    expect(sheet.columns[0]?.values).toHaveLength(50);
    expect(columnNumericValues(sheet.columns[0]!).values).toHaveLength(50);
  });

  it("finds a column by case-insensitive name", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(findColumnIndexByName(sheet, "assay")).toBe(0);
    expect(findColumnIndexByName(sheet, "missing")).toBe(-1);
  });
});
