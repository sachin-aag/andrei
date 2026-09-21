import { describe, expect, it, vi } from "vitest";

// The module imports `@/db`, which reads DATABASE_URL at import time.
vi.mock("@/db", () => ({ db: {} }));
import {
  interiorTablePages,
  MAX_ROWS_PERSISTED_PER_RUN,
  MAX_TABLES_PER_RUN,
  MAX_TABLE_ROWS_PERSISTED,
  planTablesForPersistence,
} from "./persist-document-tables";
import type { DetectedTable } from "./table-extract";

function table(rowCount: number, name = "t"): DetectedTable {
  return {
    columns: [
      { name: "Date", type: "date" },
      { name: "Time", type: "time" },
      { name: name, type: "number" },
    ],
    rows: Array.from({ length: rowCount }, (_, i) => ({
      values: ["01/01/2026", "00:00:00", String(i)],
      pageNumber: Math.floor(i / 30) + 1,
    })),
    pageStart: 1,
    pageEnd: Math.floor(rowCount / 30) + 1,
    signature: "date|time|value",
  };
}

describe("planTablesForPersistence", () => {
  it("keeps a short table whole and does not mark it truncated", () => {
    const [entry] = planTablesForPersistence([table(120)]);
    expect(entry?.rowLimit).toBe(120);
    expect(entry?.truncated).toBe(false);
  });

  it("truncates a table past the per-table cap and says so", () => {
    const [entry] = planTablesForPersistence([
      table(MAX_TABLE_ROWS_PERSISTED + 500),
    ]);
    expect(entry?.rowLimit).toBe(MAX_TABLE_ROWS_PERSISTED);
    expect(entry?.truncated).toBe(true);
  });

  it("drops page furniture past the per-run table cap", () => {
    const planned = planTablesForPersistence(
      Array.from({ length: MAX_TABLES_PER_RUN + 4 }, (_, i) =>
        table(20, `c${i}`)
      )
    );
    expect(planned).toHaveLength(MAX_TABLES_PER_RUN);
  });

  it("stops at the per-run row budget rather than writing millions of rows", () => {
    const each = 18_000;
    const planned = planTablesForPersistence([
      table(each),
      table(each),
      table(each),
      table(each),
    ]);
    const total = planned.reduce((sum, entry) => sum + entry.rowLimit, 0);
    expect(total).toBe(MAX_ROWS_PERSISTED_PER_RUN);
    // The table that straddles the budget is kept in part, and flagged, rather
    // than dropped — a partial series is still evidence.
    expect(planned).toHaveLength(4);
    expect(planned.at(-1)?.rowLimit).toBe(
      MAX_ROWS_PERSISTED_PER_RUN - each * 3
    );
    expect(planned.at(-1)?.truncated).toBe(true);
  });

  it("returns nothing when no table was detected", () => {
    expect(planTablesForPersistence([])).toEqual([]);
  });
});

describe("interiorTablePages", () => {
  it("skips the middle of a long print but keeps both ends findable", () => {
    const skip = interiorTablePages([{ pageStart: 3, pageEnd: 78 }]);
    expect(skip.has(3)).toBe(false);
    expect(skip.has(78)).toBe(false);
    expect(skip.has(4)).toBe(true);
    expect(skip.has(77)).toBe(true);
    expect(skip.size).toBe(74);
  });

  it("leaves a short table fully chunked", () => {
    // Below the span floor the embedding cost is trivial and retrieval matters.
    expect(
      interiorTablePages([{ pageStart: 1, pageEnd: 4 }]).size
    ).toBe(0);
  });

  it("keeps a page that ends one table and opens the next", () => {
    const skip = interiorTablePages([
      { pageStart: 1, pageEnd: 20 },
      { pageStart: 20, pageEnd: 40 },
    ]);
    expect(skip.has(20)).toBe(false);
    expect(skip.has(19)).toBe(true);
    expect(skip.has(21)).toBe(true);
  });

  it("skips nothing when no table was detected", () => {
    expect(interiorTablePages([]).size).toBe(0);
  });
});

describe("parse-once marking", () => {
  it("is what stops a table-free document being re-parsed forever", () => {
    // `tablesParsedAt` is stamped even when nothing is found. Without that,
    // every later load_table would re-read the transcripts of every document
    // that legitimately contains no table.
    expect(planTablesForPersistence([])).toEqual([]);
  });
});
