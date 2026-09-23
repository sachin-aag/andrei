import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyCell,
  columnPages,
  columnValues,
  detectTables,
  MIN_TABLE_ROWS,
  type ExtractablePage,
} from "./table-extract";

/** An instrument print: repeating header, units line, then the data grammar. */
function instrumentPage(pageNumber: number, startMinute: number, rows = 12) {
  const lines = [
    "ACME Pvt. Ltd.",
    "LYOPHILIZER SYSTEM (L-1901)",
    `${pageNumber} OF 6  PRINT DATE & TIME : 19/08/2026 16:22:31`,
    "DATE TIME TT1 TT2 VAC1 VAC2",
    "°C °C ubar ubar",
  ];
  for (let i = 0; i < rows; i += 1) {
    const m = startMinute + i;
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    lines.push(`22/05/2026 ${hh}:${mm}:11 -45.0 -44.8 ${800 + i}.5 800.0`);
  }
  return { pageNumber, text: lines.join("\n") } satisfies ExtractablePage;
}

const PRINT: ExtractablePage[] = [
  instrumentPage(1, 840),
  instrumentPage(2, 852),
  instrumentPage(3, 864),
];

describe("classifyCell", () => {
  it("separates dates, times, numbers and text", () => {
    expect(classifyCell("22/05/2026")).toBe("date");
    expect(classifyCell("20:59:11")).toBe("time");
    expect(classifyCell("21:06")).toBe("time");
    expect(classifyCell("1000.0000")).toBe("number");
    expect(classifyCell("-45.0")).toBe("number");
    expect(classifyCell("1,234.5")).toBe("number");
    expect(classifyCell("VAC1")).toBe("text");
    // A bare dash is a placeholder, not a number.
    expect(classifyCell("-")).toBe("text");
    // Version-like tokens must not read as numbers.
    expect(classifyCell("1.2.3")).toBe("text");
  });
});

describe("detectTables", () => {
  it("recovers the instrument series across pages", () => {
    const [table] = detectTables(PRINT);
    expect(table).toBeDefined();
    expect(table!.rows).toHaveLength(36);
    expect(table!.signature).toBe("date|time|value x4");
    expect(table!.pageStart).toBe(1);
    expect(table!.pageEnd).toBe(3);
  });

  it("recovers column names from the header, skipping the units line", () => {
    const [table] = detectTables(PRINT);
    expect(table!.columns.map((c) => c.name)).toEqual([
      "DATE",
      "TIME",
      "TT1",
      "TT2",
      "VAC1",
      "VAC2",
    ]);
    expect(table!.columns.map((c) => c.type)).toEqual([
      "date",
      "time",
      "number",
      "number",
      "number",
      "number",
    ]);
  });

  it("keeps the source page on every row", () => {
    const [table] = detectTables(PRINT);
    const pages = columnPages(table!);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(3);
    expect(new Set(pages)).toEqual(new Set([1, 2, 3]));
  });

  it("reads a column by name", () => {
    const [table] = detectTables(PRINT);
    const vac = columnValues(table!, "vac1");
    expect(vac).toHaveLength(36);
    expect(vac![0]).toBe("800.5");
    expect(columnValues(table!, "nope")).toBeNull();
  });

  it("ignores repeating prose that is not a data grammar", () => {
    // Running headers repeat on every page but never form a numeric shape.
    const prose: ExtractablePage[] = Array.from({ length: 20 }, (_, i) => ({
      pageNumber: i + 1,
      text: "M. J. Biopharm Private Limited\nInvestigation Report\nConfidential and Proprietary",
    }));
    expect(detectTables(prose)).toEqual([]);
  });

  it("does not report a table below the row floor", () => {
    const [short] = detectTables([instrumentPage(1, 840, MIN_TABLE_ROWS - 1)]);
    expect(short).toBeUndefined();
  });

  it("falls back to positional names when there is no header", () => {
    const headerless: ExtractablePage[] = [
      {
        pageNumber: 1,
        text: Array.from(
          { length: 10 },
          (_, i) => `22/05/2026 10:0${i}:00 ${i}.5 ${i + 1}.5`
        ).join("\n"),
      },
    ];
    const [table] = detectTables(headerless);
    expect(table!.columns.map((c) => c.name)).toEqual(["C1", "C2", "C3", "C4"]);
  });

  it("types a column as text when its cells disagree", () => {
    const mixed: ExtractablePage[] = [
      {
        pageNumber: 1,
        text: [
          "DATE TIME VALUE NOTE",
          ...Array.from({ length: 10 }, (_, i) =>
            `22/05/2026 10:0${i}:00 ${i}.5 ${i === 3 ? "OOT" : "1.0"}`
          ),
        ].join("\n"),
      },
    ];
    const [table] = detectTables(mixed);
    // The OOT row must survive: grouping tolerates a marker in a value cell.
    expect(table!.rows).toHaveLength(10);
    expect(table!.rows[3]!.values[3]).toBe("OOT");
    // One non-numeric cell demotes the whole column rather than silently
    // dropping the outlier — which is exactly the cell an investigator wants.
    expect(table!.columns[3]!.type).toBe("text");
  });
});

/**
 * Real instrument prints, when they have been staged locally. Skipped in CI:
 * the source PDFs are customer documents and are gitignored.
 */
const REAL = "/tmp/trend";
const realFiles = fs.existsSync(REAL)
  ? fs.readdirSync(REAL).filter((f) => f.endsWith(".txt")).sort()
  : [];

describe.skipIf(realFiles.length === 0)("real lyophilizer prints", () => {
  it("finds the same grammar in every print", () => {
    for (const file of realFiles) {
      const text = fs.readFileSync(path.join(REAL, file), "utf8");
      const parts = text.split(/(?=M\. J\. BIOPHARM Pvt\. Ltd\.)/);
      const pages = parts.map((t, i) => ({ pageNumber: i + 1, text: t }));
      const [table] = detectTables(pages);
      expect(table, file).toBeDefined();
      expect(table!.signature, file).toBe("date|time|value x9");
      expect(table!.columns.map((c) => c.name), file).toEqual([
        "DATE", "TIME", "TT1", "TT2", "TT3", "TT4", "TT5", "TT6",
        "VAC1", "VAC2", "PT1",
      ]);
      expect(table!.rows.length, file).toBeGreaterThan(2000);
    }
  });
});

describe("prose that merely contains numbers", () => {
  it("does not detect a running footer as a table", () => {
    // Found by running the real readPdfTextLayer over a 49-page requirements
    // document: the repeating footer carries "Page 1 of 49", which a bare
    // has-a-number test read as a 49-row, 10-column table.
    const pages: ExtractablePage[] = Array.from({ length: 49 }, (_, i) => ({
      pageNumber: i + 1,
      text: `Requirements Document Template, 731-00003 Rev. A Page ${i + 1} of 49`,
    }));
    expect(detectTables(pages)).toEqual([]);
  });

  it("still accepts a record whose row is mostly data", () => {
    const pages: ExtractablePage[] = [
      {
        pageNumber: 1,
        text: [
          "ID VALUE LIMIT RESULT",
          ...Array.from({ length: 10 }, (_, i) => `R-${i} ${i}.5 6.0 1`),
        ].join("\n"),
      },
    ];
    const [table] = detectTables(pages);
    expect(table?.rows).toHaveLength(10);
  });
});
