import { describe, expect, it } from "vitest";
import {
  applyManageWorksheet,
  manageWorksheetInputSchema,
} from "./manage-worksheet";
import {
  addDataSheet,
  createEmptyWorksheet,
  findSheet,
  setCell,
} from "./worksheet";
import { MAX_DATA_SHEETS, PRIMARY_DATA_SHEET_ID } from "./types";

describe("applyManageWorksheet", () => {
  it("adds a named data sheet and switches to it", () => {
    const { worksheet, result } = applyManageWorksheet(createEmptyWorksheet(), {
      action: "add_sheet",
      name: "Assay",
    });
    expect(result).toMatchObject({
      status: "ok",
      action: "add_sheet",
      sheetName: "Assay",
    });
    expect(worksheet?.sheets).toHaveLength(2);
    expect(worksheet?.activeSheetId).toBe(result.status === "ok" ? result.sheetId : "");
    expect(findSheet(worksheet!, "Assay")?.name).toBe("Assay");
  });

  it("renames, then deletes a data sheet", () => {
    const sheet = addDataSheet(createEmptyWorksheet(), "Extra");
    const extraId = sheet.activeSheetId;
    const renamed = applyManageWorksheet(sheet, {
      action: "rename_sheet",
      sheetId: extraId,
      name: "Moisture",
    });
    expect(renamed.result).toMatchObject({ status: "ok", sheetName: "Moisture" });
    const deleted = applyManageWorksheet(renamed.worksheet!, {
      action: "delete_sheet",
      sheetId: extraId,
    });
    expect(deleted.result.status).toBe("ok");
    expect(deleted.worksheet?.sheets).toHaveLength(1);
    expect(deleted.worksheet?.activeSheetId).toBe(PRIMARY_DATA_SHEET_ID);
  });

  it("refuses to delete the last data sheet or treat Specs as a sheet", () => {
    expect(
      applyManageWorksheet(createEmptyWorksheet(), {
        action: "delete_sheet",
        sheetId: PRIMARY_DATA_SHEET_ID,
      }).result
    ).toMatchObject({ status: "error" });
    expect(
      applyManageWorksheet(createEmptyWorksheet(), {
        action: "add_column",
        sheetId: "Specs",
      }).result
    ).toMatchObject({ status: "error" });
  });

  it("adds, renames, and deletes a column without touching attachments", () => {
    const added = applyManageWorksheet(createEmptyWorksheet(), {
      action: "add_column",
      name: "Assay %",
    });
    expect(added.result).toMatchObject({
      status: "ok",
      columnName: "Assay %",
    });
    expect(added.worksheet?.columns).toHaveLength(9);

    const renamed = applyManageWorksheet(added.worksheet!, {
      action: "rename_column",
      columnId: "Assay %",
      name: "Assay",
    });
    expect(renamed.result).toMatchObject({ status: "ok", columnName: "Assay" });

    const deleted = applyManageWorksheet(renamed.worksheet!, {
      action: "delete_column",
      columnId: "Assay",
    });
    expect(deleted.result.status).toBe("ok");
    expect(deleted.worksheet?.columns).toHaveLength(8);
  });

  it("inserts a row in the middle of filled cells and deletes it", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = setCell(sheet, 0, 0, "10");
    sheet = setCell(sheet, 0, 1, "20");
    const inserted = applyManageWorksheet(sheet, {
      action: "add_row",
      row: 2,
    });
    expect(inserted.result).toMatchObject({ status: "ok", row: 2 });
    expect(inserted.worksheet?.columns[0]?.values).toEqual(["10", "", "20"]);

    const deleted = applyManageWorksheet(inserted.worksheet!, {
      action: "delete_row",
      row: 2,
    });
    expect(deleted.worksheet?.columns[0]?.values).toEqual(["10", "20"]);
  });

  it("sets a cell and reports the next empty row when append would trim", () => {
    let sheet = createEmptyWorksheet(1);
    sheet = setCell(sheet, 0, 0, "10");
    const cell = applyManageWorksheet(sheet, {
      action: "set_cell",
      columnId: "c1",
      row: 2,
      value: 11.5,
    });
    expect(cell.result).toMatchObject({ status: "ok", row: 2 });
    expect(cell.worksheet?.columns[0]?.values).toEqual(["10", "11.5"]);

    const appended = applyManageWorksheet(cell.worksheet!, { action: "add_row" });
    expect(appended.result).toMatchObject({ status: "ok", row: 3 });
    expect(appended.result.status === "ok" && appended.result.message).toMatch(
      /already empty/i
    );
    expect(appended.worksheet?.columns[0]?.values).toEqual(["10", "11.5"]);
  });

  it("stops at the data-sheet cap", () => {
    let sheet = createEmptyWorksheet();
    for (let i = 1; i < MAX_DATA_SHEETS; i++) {
      const next = applyManageWorksheet(sheet, { action: "add_sheet" });
      expect(next.result.status).toBe("ok");
      sheet = next.worksheet!;
    }
    expect(
      applyManageWorksheet(sheet, { action: "add_sheet" }).result
    ).toMatchObject({ status: "error" });
  });

  it("applies a batch of operations in order", () => {
    const first = applyManageWorksheet(createEmptyWorksheet(), {
      action: "add_column",
      name: "Time",
    });
    expect(first.result.status).toBe("ok");
    const second = applyManageWorksheet(first.worksheet!, {
      action: "add_column",
      name: "Temp",
    });
    expect(second.result).toMatchObject({ status: "ok", columnName: "Temp" });
    expect(second.worksheet?.columns.map((column) => column.name)).toContain(
      "Time"
    );
    expect(second.worksheet?.columns.map((column) => column.name)).toContain(
      "Temp"
    );
  });

  it("parses a batch of operations without a top-level action", () => {
    const parsed = manageWorksheetInputSchema.safeParse({
      operations: [
        { action: "add_column", name: "Time" },
        { action: "add_column", name: "Temp" },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(
      manageWorksheetInputSchema.safeParse({}).success
    ).toBe(false);
  });
});
