import { z } from "zod";
import {
  MAX_CELL_LENGTH,
  MAX_COLUMN_NAME_LENGTH,
  MAX_DATA_SHEETS,
  MAX_WORKSHEET_COLUMNS,
  MAX_WORKSHEET_ROWS,
  SPECS_TAB_ID,
  type WorksheetData,
} from "./types";
import {
  addDataSheet,
  dataSheets,
  deleteColumn,
  deleteDataSheet,
  deleteRow,
  findColumnIndex,
  findColumnIndexByName,
  findPlaceholderColumnIndex,
  findSheet,
  findSheetIdForColumn,
  findSheetIdForColumnName,
  insertColumn,
  insertRow,
  isSpecsTab,
  renameColumn,
  renameDataSheet,
  rowCount,
  sanitizeCell,
  setCell,
  switchWorksheetTab,
} from "./worksheet";

export const MANAGE_WORKSHEET_ACTIONS = [
  "add_sheet",
  "rename_sheet",
  "delete_sheet",
  "add_column",
  "rename_column",
  "delete_column",
  "add_row",
  "delete_row",
  "set_cell",
] as const;

export type ManageWorksheetAction = (typeof MANAGE_WORKSHEET_ACTIONS)[number];

const manageWorksheetOperationFields = {
  action: z
    .enum(MANAGE_WORKSHEET_ACTIONS)
    .describe(
      "add_sheet, rename_sheet, delete_sheet, add_column, rename_column, delete_column, add_row, delete_row, or set_cell."
    ),
  sheetId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe(
      "Data sheet id (data-1) or tab name. Defaults to the active data sheet. Not Specs."
    ),
  columnId: z
    .string()
    .trim()
    .min(1)
    .max(MAX_COLUMN_NAME_LENGTH)
    .optional()
    .describe("Column id (c1) or header (C1, Assay). Required for column and cell actions except add_column."),
  name: z
    .string()
    .trim()
    .max(80)
    .optional()
    .describe("New sheet or column name for add/rename."),
  row: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKSHEET_ROWS)
    .optional()
    .describe(
      "1-based row number. For add_row, omit to append. Required for delete_row and set_cell."
    ),
  at: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKSHEET_COLUMNS)
    .optional()
    .describe(
      "1-based insert position for add_column. Omit to claim the leftmost empty C# column, or append if none remain."
    ),
  value: z
    .union([z.number().finite(), z.string().max(MAX_CELL_LENGTH)])
    .optional()
    .describe("Cell value for set_cell."),
} as const;

export const manageWorksheetOperationSchema = z.object(
  manageWorksheetOperationFields
);

export const manageWorksheetInputSchema = z
  .object({
    ...manageWorksheetOperationFields,
    action: manageWorksheetOperationFields.action.optional(),
    operations: z
      .array(manageWorksheetOperationSchema)
      .min(1)
      .max(40)
      .optional()
      .describe(
        "Several add/rename/delete operations applied in order and saved once. Prefer this over calling the tool repeatedly."
      ),
  })
  .superRefine((value, ctx) => {
    if (value.operations && value.operations.length > 0) return;
    if (!value.action) {
      ctx.addIssue({
        code: "custom",
        message: "Provide action or operations.",
        path: ["action"],
      });
    }
  });

export type ManageWorksheetOperation = z.infer<
  typeof manageWorksheetOperationSchema
>;
export type ManageWorksheetInput = z.infer<typeof manageWorksheetInputSchema>;

export type ManageWorksheetResult =
  | {
      status: "ok";
      action: ManageWorksheetAction;
      message: string;
      sheetId: string;
      sheetName: string;
      columnId?: string;
      columnName?: string;
      row?: number;
    }
  | { status: "error"; message: string }
  | { status: "not_found"; message: string };

function isSpecsName(value: string): boolean {
  const key = value.trim();
  return key === SPECS_TAB_ID || key.toLowerCase() === "specs";
}

function requiredName(
  value: string | undefined
): { ok: true; name: string } | { ok: false; result: ManageWorksheetResult } {
  const name = value?.trim() ?? "";
  if (!name) {
    return {
      ok: false,
      result: { status: "error", message: "Provide a name." },
    };
  }
  return { ok: true, name };
}

function activateSheet(
  worksheet: WorksheetData,
  sheetIdOrName: string | undefined
):
  | { ok: true; worksheet: WorksheetData }
  | { ok: false; result: ManageWorksheetResult } {
  if (sheetIdOrName && isSpecsName(sheetIdOrName)) {
    return {
      ok: false,
      result: {
        status: "error",
        message: "Specs is not a data sheet. Use a Data tab.",
      },
    };
  }
  if (sheetIdOrName) {
    const sheet = findSheet(worksheet, sheetIdOrName);
    if (!sheet) {
      return {
        ok: false,
        result: {
          status: "not_found",
          message: `No data sheet named "${sheetIdOrName.trim()}".`,
        },
      };
    }
    return { ok: true, worksheet: switchWorksheetTab(worksheet, sheet.id) };
  }
  if (isSpecsTab(worksheet)) {
    const first = dataSheets(worksheet)[0];
    if (!first) {
      return {
        ok: false,
        result: { status: "error", message: "No data sheet is available." },
      };
    }
    return { ok: true, worksheet: switchWorksheetTab(worksheet, first.id) };
  }
  return { ok: true, worksheet };
}

function activateForColumn(
  worksheet: WorksheetData,
  input: Pick<ManageWorksheetOperation, "sheetId" | "columnId">
):
  | { ok: true; worksheet: WorksheetData }
  | { ok: false; result: ManageWorksheetResult } {
  if (input.sheetId) return activateSheet(worksheet, input.sheetId);
  if (input.columnId) {
    const byId = findSheetIdForColumn(worksheet, input.columnId);
    if (byId) {
      return { ok: true, worksheet: switchWorksheetTab(worksheet, byId) };
    }
    const byName = findSheetIdForColumnName(worksheet, input.columnId);
    if (byName) {
      return { ok: true, worksheet: switchWorksheetTab(worksheet, byName) };
    }
  }
  return activateSheet(worksheet, undefined);
}

function columnIndexOnActiveSheet(
  worksheet: WorksheetData,
  columnIdOrName: string
): number {
  const byId = findColumnIndex(worksheet, columnIdOrName);
  if (byId >= 0) return byId;
  return findColumnIndexByName(worksheet, columnIdOrName);
}

function requireColumn(
  worksheet: WorksheetData,
  columnIdOrName: string | undefined
):
  | { ok: true; index: number }
  | { ok: false; result: ManageWorksheetResult } {
  const key = columnIdOrName?.trim() ?? "";
  if (!key) {
    return {
      ok: false,
      result: { status: "error", message: "Provide columnId (c1) or the header name." },
    };
  }
  const index = columnIndexOnActiveSheet(worksheet, key);
  if (index < 0) {
    return {
      ok: false,
      result: {
        status: "not_found",
        message: `No column named "${key}" on this sheet.`,
      },
    };
  }
  return { ok: true, index };
}

function sheetMeta(worksheet: WorksheetData): {
  sheetId: string;
  sheetName: string;
} {
  const activeId = worksheet.activeSheetId;
  const sheet =
    dataSheets(worksheet).find((item) => item.id === activeId) ??
    dataSheets(worksheet)[0];
  return {
    sheetId: sheet?.id ?? activeId,
    sheetName: sheet?.name ?? "Data",
  };
}

function ok(
  worksheet: WorksheetData,
  action: ManageWorksheetAction,
  message: string,
  extra?: { columnId?: string; columnName?: string; row?: number }
): { worksheet: WorksheetData; result: ManageWorksheetResult } {
  return {
    worksheet,
    result: {
      status: "ok",
      action,
      message,
      ...sheetMeta(worksheet),
      ...extra,
    },
  };
}

function fail(result: ManageWorksheetResult): {
  worksheet: WorksheetData | null;
  result: ManageWorksheetResult;
} {
  return { worksheet: null, result };
}

export function applyManageWorksheet(
  data: WorksheetData,
  input: ManageWorksheetOperation | ManageWorksheetInput
): { worksheet: WorksheetData | null; result: ManageWorksheetResult } {
  if (!input.action) {
    return fail({
      status: "error",
      message: "Provide action or operations.",
    });
  }
  switch (input.action) {
    case "add_sheet": {
      const requested = input.name?.trim() ?? "";
      const existing = requested ? findSheet(data, requested) : undefined;
      if (existing) {
        return ok(
          switchWorksheetTab(data, existing.id),
          "add_sheet",
          `Using existing data sheet ${existing.name}`
        );
      }
      if (dataSheets(data).length >= MAX_DATA_SHEETS) {
        return fail({
          status: "error",
          message: `This workbook already has ${MAX_DATA_SHEETS} data sheets.`,
        });
      }
      const next = addDataSheet(data, input.name);
      const created =
        dataSheets(next).find((sheet) => sheet.id === next.activeSheetId) ??
        dataSheets(next).at(-1);
      if (!created) {
        return fail({ status: "error", message: "Could not add a data sheet." });
      }
      return ok(next, "add_sheet", `Added data sheet ${created.name} — check the worksheet`);
    }
    case "rename_sheet": {
      const named = requiredName(input.name);
      if (!named.ok) return fail(named.result);
      const activated = activateSheet(data, input.sheetId);
      if (!activated.ok) return fail(activated.result);
      const { sheetId, sheetName } = sheetMeta(activated.worksheet);
      const next = renameDataSheet(activated.worksheet, sheetId, named.name);
      const renamed = findSheet(next, sheetId);
      return ok(
        next,
        "rename_sheet",
        `Renamed ${sheetName} to ${renamed?.name ?? named.name} — check the worksheet`
      );
    }
    case "delete_sheet": {
      const activated = activateSheet(data, input.sheetId);
      if (!activated.ok) return fail(activated.result);
      if (dataSheets(activated.worksheet).length <= 1) {
        return fail({
          status: "error",
          message: "The workbook must keep at least one data sheet.",
        });
      }
      const { sheetId, sheetName } = sheetMeta(activated.worksheet);
      const next = deleteDataSheet(activated.worksheet, sheetId);
      return ok(next, "delete_sheet", `Deleted sheet ${sheetName} — check the worksheet`);
    }
    case "add_column": {
      const activated = activateSheet(data, input.sheetId);
      if (!activated.ok) return fail(activated.result);
      if (input.at == null) {
        const placeholder = findPlaceholderColumnIndex(activated.worksheet);
        if (placeholder >= 0) {
          let next = activated.worksheet;
          if (input.name?.trim()) {
            next = renameColumn(next, placeholder, input.name);
          }
          const column = next.columns[placeholder];
          if (!column) {
            return fail({ status: "error", message: "Could not add a column." });
          }
          return ok(
            next,
            "add_column",
            `Added column ${column.name} — check the worksheet`,
            {
              columnId: column.id,
              columnName: column.name,
            }
          );
        }
      }
      if (activated.worksheet.columns.length >= MAX_WORKSHEET_COLUMNS) {
        return fail({
          status: "error",
          message: `This sheet already has ${MAX_WORKSHEET_COLUMNS} columns.`,
        });
      }
      const insertAt =
        input.at != null
          ? input.at - 1
          : activated.worksheet.columns.length;
      let next = insertColumn(activated.worksheet, insertAt);
      const index = Math.max(
        0,
        Math.min(insertAt, next.columns.length - 1)
      );
      if (input.name?.trim()) {
        next = renameColumn(next, index, input.name);
      }
      const column = next.columns[index];
      if (!column) {
        return fail({ status: "error", message: "Could not add a column." });
      }
      return ok(next, "add_column", `Added column ${column.name} — check the worksheet`, {
        columnId: column.id,
        columnName: column.name,
      });
    }
    case "rename_column": {
      const named = requiredName(input.name);
      if (!named.ok) return fail(named.result);
      const activated = activateForColumn(data, input);
      if (!activated.ok) return fail(activated.result);
      const found = requireColumn(activated.worksheet, input.columnId);
      if (!found.ok) return fail(found.result);
      const previous = activated.worksheet.columns[found.index]?.name ?? input.columnId;
      const next = renameColumn(activated.worksheet, found.index, named.name);
      const column = next.columns[found.index];
      return ok(
        next,
        "rename_column",
        `Renamed ${previous} to ${column?.name ?? named.name} — check the worksheet`,
        {
          columnId: column?.id,
          columnName: column?.name,
        }
      );
    }
    case "delete_column": {
      const activated = activateForColumn(data, input);
      if (!activated.ok) return fail(activated.result);
      const found = requireColumn(activated.worksheet, input.columnId);
      if (!found.ok) return fail(found.result);
      const column = activated.worksheet.columns[found.index];
      const last = activated.worksheet.columns.length <= 1;
      const next = deleteColumn(activated.worksheet, found.index);
      return ok(
        next,
        "delete_column",
        last
          ? `Cleared the last column (${column?.name ?? "column"}) — check the worksheet`
          : `Deleted column ${column?.name ?? "column"} — check the worksheet`,
        {
          columnId: column?.id,
          columnName: column?.name,
        }
      );
    }
    case "add_row": {
      const activated = activateSheet(data, input.sheetId);
      if (!activated.ok) return fail(activated.result);
      const filled = rowCount(activated.worksheet);
      if (filled >= MAX_WORKSHEET_ROWS) {
        return fail({
          status: "error",
          message: `This sheet already has ${MAX_WORKSHEET_ROWS} rows.`,
        });
      }
      const insertAt = input.row != null ? input.row - 1 : filled;
      const next = insertRow(activated.worksheet, insertAt);
      const after = rowCount(next);
      if (after <= filled) {
        const ready = filled + 1;
        return ok(
          activated.worksheet,
          "add_row",
          filled === 0
            ? "The sheet already has empty rows ready to use (row 1)."
            : `Row ${ready} is already empty. Type into it on the worksheet.`,
          { row: ready }
        );
      }
      const row = Math.min(insertAt, filled) + 1;
      return ok(next, "add_row", `Inserted a row at row ${row} — check the worksheet`, {
        row,
      });
    }
    case "delete_row": {
      if (input.row == null) {
        return fail({
          status: "error",
          message: "Provide a 1-based row number to delete.",
        });
      }
      const activated = activateSheet(data, input.sheetId);
      if (!activated.ok) return fail(activated.result);
      const filled = rowCount(activated.worksheet);
      if (input.row > filled) {
        return fail({
          status: "not_found",
          message: `Row ${input.row} is already empty.`,
        });
      }
      const next = deleteRow(activated.worksheet, input.row - 1);
      return ok(
        next,
        "delete_row",
        `Deleted row ${input.row} — check the worksheet`,
        { row: input.row }
      );
    }
    case "set_cell": {
      if (input.row == null) {
        return fail({
          status: "error",
          message: "Provide a 1-based row number.",
        });
      }
      if (input.value === undefined) {
        return fail({
          status: "error",
          message: "Provide a value for the cell.",
        });
      }
      const activated = activateForColumn(data, input);
      if (!activated.ok) return fail(activated.result);
      const found = requireColumn(activated.worksheet, input.columnId);
      if (!found.ok) return fail(found.result);
      const column = activated.worksheet.columns[found.index];
      const next = setCell(
        activated.worksheet,
        found.index,
        input.row - 1,
        sanitizeCell(String(input.value))
      );
      return ok(
        next,
        "set_cell",
        `Set ${column?.name ?? "column"} row ${input.row} — check the worksheet`,
        {
          columnId: column?.id,
          columnName: column?.name,
          row: input.row,
        }
      );
    }
    default: {
      const exhaustive: never = input.action;
      return fail({
        status: "error",
        message: `Unknown action ${String(exhaustive)}.`,
      });
    }
  }
}
