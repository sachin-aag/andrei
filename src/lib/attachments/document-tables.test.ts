import { describe, expect, it, vi } from "vitest";

// The module imports `@/db`, which reads DATABASE_URL at import time.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/attachments/persist-document-tables", () => ({
  persistDocumentTablesForRun: vi.fn(),
}));

import {
  columnCellsFromLoadedTable,
  type LoadedDetectedTable,
} from "./document-tables";

function loaded(): LoadedDetectedTable {
  return {
    tableId: "t1",
    attachmentId: "a1",
    filename: "Print _ Lyophilizer_RIG25014.pdf",
    columns: [
      { name: "DATE", type: "date" },
      { name: "TIME", type: "time" },
      { name: "VAC1", type: "number" },
    ],
    rowCount: 3,
    pageStart: 1,
    pageEnd: 2,
    truncated: false,
    rowStart: 1,
    hasMore: false,
    rows: [
      { ordinal: 0, pageNumber: 1, values: ["22/05/2026", "20:59:11", "192.4"] },
      { ordinal: 1, pageNumber: 1, values: ["22/05/2026", "21:00:11", "640.2"] },
      { ordinal: 2, pageNumber: 2, values: ["22/05/2026", "21:01:11", "802.0"] },
    ],
  };
}

describe("columnCellsFromLoadedTable", () => {
  it("returns a named column's cells in row order", () => {
    expect(columnCellsFromLoadedTable(loaded(), "VAC1")).toEqual({
      name: "VAC1",
      index: 2,
      values: ["192.4", "640.2", "802.0"],
    });
  });

  it("matches a header case-insensitively", () => {
    expect(columnCellsFromLoadedTable(loaded(), "vac1")?.index).toBe(2);
  });

  it("resolves a 1-based position when the header was never recovered", () => {
    // Instrument prints do not always carry a header line above the data.
    expect(columnCellsFromLoadedTable(loaded(), "2")).toEqual({
      name: "TIME",
      index: 1,
      values: ["20:59:11", "21:00:11", "21:01:11"],
    });
  });

  it("returns null for a column that is not in the table", () => {
    expect(columnCellsFromLoadedTable(loaded(), "TT7")).toBeNull();
    expect(columnCellsFromLoadedTable(loaded(), "9")).toBeNull();
    expect(columnCellsFromLoadedTable(loaded(), "  ")).toBeNull();
  });
});
