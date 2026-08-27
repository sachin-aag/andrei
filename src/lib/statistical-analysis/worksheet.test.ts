import { describe, expect, it } from "vitest";
import { applySampleAssay } from "./sample-data";
import {
  analysisSourceKey,
  addDataSheet,
  columnNumericValues,
  columnSourceKey,
  createEmptyWorksheet,
  defaultSixpackLimits,
  deleteColumn,
  deleteDataSheet,
  deleteRow,
  deleteRows,
  findColumnIndexByName,
  clearColumn,
  clearRows,
  insertColumn,
  insertRow,
  isSpecsTab,
  mergeDirtyWorksheet,
  normalizeWorksheet,
  parseTsv,
  pasteTsv,
  renameColumn,
  replaceColumnValues,
  rowCount,
  setCell,
  specRowForColumn,
  switchWorksheetTab,
  trimTrailingEmpty,
} from "./worksheet";
import {
  PRIMARY_DATA_SHEET_ID,
  SPECS_TAB_ID,
} from "./types";

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

  it("inserts a column to the left or right of an index", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = insertColumn(sheet, 0);
    expect(sheet.columns.map((column) => column.name)).toEqual(["C3", "C1", "C2"]);
    sheet = insertColumn(sheet, sheet.columns.length);
    expect(sheet.columns.map((column) => column.name)).toEqual([
      "C3",
      "C1",
      "C2",
      "C4",
    ]);
  });

  it("clears column values without dropping the column or specs", () => {
    let sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(sheet.columns[0]?.values.length).toBeGreaterThan(0);
    sheet = clearColumn(sheet, 0);
    expect(sheet.columns[0]?.name).toBe("Assay");
    expect(sheet.columns[0]?.values).toEqual([]);
    expect(specRowForColumn(sheet, "Assay")).toEqual({
      columnName: "Assay",
      lsl: "90",
      usl: "110",
      target: "100",
    });
  });

  it("inserts, clears, and deletes rows across every column", () => {
    let sheet = createEmptyWorksheet(2);
    sheet = setCell(sheet, 0, 0, "a1");
    sheet = setCell(sheet, 1, 0, "b1");
    sheet = setCell(sheet, 0, 1, "a2");
    sheet = setCell(sheet, 1, 1, "b2");
    sheet = setCell(sheet, 0, 2, "a3");
    sheet = setCell(sheet, 1, 2, "b3");

    sheet = insertRow(sheet, 1);
    expect(sheet.columns[0]?.values).toEqual(["a1", "", "a2", "a3"]);
    expect(sheet.columns[1]?.values).toEqual(["b1", "", "b2", "b3"]);

    sheet = clearRows(sheet, 0, 1);
    expect(sheet.columns[0]?.values).toEqual(["", "", "a2", "a3"]);
    expect(sheet.columns[1]?.values).toEqual(["", "", "b2", "b3"]);

    sheet = deleteRows(sheet, 0, 1);
    expect(sheet.columns[0]?.values).toEqual(["a2", "a3"]);
    expect(sheet.columns[1]?.values).toEqual(["b2", "b3"]);

    sheet = deleteRow(sheet, 0);
    expect(sheet.columns[0]?.values).toEqual(["a3"]);
    expect(sheet.columns[1]?.values).toEqual(["b3"]);
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
    expect(specRowForColumn(sheet, "Assay")).toEqual({
      columnName: "Assay",
      lsl: "90",
      usl: "110",
      target: "100",
    });
  });

  it("fills Lot labels on the adjacent column of the sample assay", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(sheet.columns[1]?.name).toBe("Lot");
    expect(sheet.columns[1]?.values[0]).toBe("A");
    expect(sheet.columns[1]?.values[1]).toBe("B");
    expect(sheet.columns[1]?.values[2]).toBe("C");
    expect(sheet.columns[1]?.values).toHaveLength(50);
  });

  it("finds a column by case-insensitive name", () => {
    const sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(findColumnIndexByName(sheet, "assay")).toBe(0);
    expect(findColumnIndexByName(sheet, "missing")).toBe(-1);
  });

  it("normalizes a legacy columns-only worksheet into a Data sheet", () => {
    const next = normalizeWorksheet({
      columns: [{ id: "c1", name: "Assay", values: ["101"] }],
    });
    expect(next.sheets).toHaveLength(1);
    expect(next.sheets[0]?.id).toBe(PRIMARY_DATA_SHEET_ID);
    expect(next.sheets[0]?.name).toBe("Data");
    expect(next.columns[0]?.values).toEqual(["101"]);
    expect(next.specs).toEqual([]);
    expect(next.activeSheetId).toBe(PRIMARY_DATA_SHEET_ID);
  });

  it("adds a named data sheet", () => {
    const sheet = addDataSheet(createEmptyWorksheet(), "Assay");
    expect(sheet.sheets).toHaveLength(2);
    expect(sheet.sheets[1]?.name).toBe("Assay");
    expect(sheet.activeSheetId).toBe("data-2");
  });

  it("adds a second data sheet and maps a legacy Specs tab onto Data", () => {
    let sheet = createEmptyWorksheet();
    sheet = addDataSheet(sheet);
    expect(sheet.sheets).toHaveLength(2);
    expect(sheet.activeSheetId).toBe("data-2");
    expect(sheet.columns[0]?.id).not.toBe(sheet.sheets[0]?.columns[0]?.id);
    expect(sheet.columns.map((column) => column.id)).toEqual([
      "c9",
      "c10",
      "c11",
      "c12",
      "c13",
      "c14",
      "c15",
      "c16",
    ]);
    sheet = switchWorksheetTab(sheet, SPECS_TAB_ID);
    expect(isSpecsTab(sheet)).toBe(false);
    expect(sheet.activeSheetId).toBe(PRIMARY_DATA_SHEET_ID);
    const legacy = normalizeWorksheet({
      ...sheet,
      activeSheetId: SPECS_TAB_ID,
    });
    expect(legacy.activeSheetId).toBe(PRIMARY_DATA_SHEET_ID);
    expect(isSpecsTab(legacy)).toBe(false);
  });

  it("renames and deletes column specs with the column", () => {
    let sheet = applySampleAssay(createEmptyWorksheet(), 0);
    expect(specRowForColumn(sheet, "Assay")?.lsl).toBe("90");
    sheet = renameColumn(sheet, 0, "Assay %");
    expect(specRowForColumn(sheet, "Assay")).toBeUndefined();
    expect(specRowForColumn(sheet, "Assay %")).toEqual({
      columnName: "Assay %",
      lsl: "90",
      usl: "110",
      target: "100",
    });
    sheet = deleteColumn(sheet, 0);
    expect(specRowForColumn(sheet, "Assay %")).toBeUndefined();
  });

  it("prefers named spec limits, then min/max of the selected values", () => {
    const withSpecs = applySampleAssay(createEmptyWorksheet(), 0);
    expect(
      defaultSixpackLimits({
        columnName: "Assay",
        values: [101, 103],
        worksheet: withSpecs,
      })
    ).toEqual({ lsl: 90, usl: 110, target: 100 });

    const empty = createEmptyWorksheet();
    expect(
      defaultSixpackLimits({
        columnName: "Moisture",
        values: [3.97, 4.25, 4.11],
        worksheet: empty,
      })
    ).toEqual({ lsl: 3.97, usl: 4.25, target: 4.11 });

    expect(
      defaultSixpackLimits({
        columnName: "Moisture",
        values: [],
        worksheet: empty,
      })
    ).toEqual({ lsl: null, usl: null, target: null });
  });

  it("refuses to delete the last data sheet", () => {
    const sheet = deleteDataSheet(createEmptyWorksheet(), PRIMARY_DATA_SHEET_ID);
    expect(sheet.sheets).toHaveLength(1);
  });

  it("keeps local cell edits when merging a newer remote worksheet", () => {
    const persisted = replaceColumnValues(
      createEmptyWorksheet(),
      0,
      ["3", "2.5"],
      "Torque (ozf-in)"
    );
    const local = setCell(persisted, 0, 1, "9");
    const remote = insertColumn(persisted, 1);
    const merged = mergeDirtyWorksheet(local, persisted, remote);
    expect(merged.columns[0]?.values.slice(0, 2)).toEqual(["3", "9"]);
    expect(merged.columns).toHaveLength(remote.columns.length);
    expect(merged.columns[1]?.id).toBe(remote.columns[1]?.id);
  });

  it("takes the remote sheet when local has no unsaved cells", () => {
    const persisted = replaceColumnValues(
      createEmptyWorksheet(),
      0,
      ["3", "2.5"],
      "Torque (ozf-in)"
    );
    const remote = insertColumn(persisted, 1);
    const merged = mergeDirtyWorksheet(persisted, persisted, remote);
    expect(merged.columns[0]?.values.slice(0, 2)).toEqual(["3", "2.5"]);
    expect(merged.columns).toHaveLength(remote.columns.length);
    expect(merged.columns[1]?.id).toBe(remote.columns[1]?.id);
  });
});
