import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildSpreadsheetPages,
  parseCsvBuffer,
  parseCsvRecords,
  parseXlsxBuffer,
  spreadsheetSummary,
  spreadsheetTables,
} from "@/lib/attachments/spreadsheet-parse";

const tightLimits = {
  maxSheets: 2,
  maxColumns: 4,
  maxRowsPerSheet: 3,
  maxCells: 40,
};

async function xlsxFromRows(
  sheets: Array<{ name: string; rows: unknown[][] }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("parseCsvRecords", () => {
  it("parses comma, quoted commas, and escaped quotes", () => {
    expect(parseCsvRecords('a,"b,c","d""e"\n1,2,3')).toEqual([
      ["a", "b,c", 'd"e'],
      ["1", "2", "3"],
    ]);
  });

  it("detects semicolon and tab delimiters from the sample", () => {
    expect(parseCsvRecords("a;b;c\n1;2;3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
    expect(parseCsvRecords("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("rejects an unclosed quote", () => {
    expect(() => parseCsvRecords('a,"b')).toThrow(/not a valid CSV/i);
  });
});

describe("parseCsvBuffer", () => {
  it("treats the first row as headers and strips a UTF-8 BOM", () => {
    const buffer = Buffer.from("\uFEFFbatch,result\nB-1,pass\n");
    const document = parseCsvBuffer(buffer);
    expect(document.sheets).toHaveLength(1);
    expect(document.sheets[0]?.name).toBe("Sheet1");
    expect(document.sheets[0]?.columns).toEqual(["batch", "result"]);
    expect(document.sheets[0]?.rows).toEqual([["B-1", "pass"]]);
  });

  it("decodes a UTF-16 LE BOM", () => {
    const text = "name,value\nalpha,1\n";
    const buffer = Buffer.from(`\uFEFF${text}`, "utf16le");
    const document = parseCsvBuffer(buffer);
    expect(document.sheets[0]?.columns).toEqual(["name", "value"]);
    expect(document.sheets[0]?.rows).toEqual([["alpha", "1"]]);
  });

  it("rejects empty and binary buffers", () => {
    expect(() => parseCsvBuffer(Buffer.from(""))).toThrow(/not a valid CSV/i);
    expect(() => parseCsvBuffer(Buffer.from([0x00, 0x01, 0x02]))).toThrow(
      /not a valid CSV/i
    );
  });

  it("enforces column and row caps", () => {
    expect(() =>
      parseCsvBuffer(Buffer.from("a,b,c,d,e\n1,2,3,4,5\n"), tightLimits)
    ).toThrow(/too many columns/i);
    expect(() =>
      parseCsvBuffer(
        Buffer.from("h1,h2\nr1,a\nr2,b\nr3,c\nr4,d\n"),
        tightLimits
      )
    ).toThrow(/too many rows/i);
  });
});

describe("parseXlsxBuffer", () => {
  it("reads sheet names, booleans, and numbers", async () => {
    const buffer = await xlsxFromRows([
      {
        name: "Results",
        rows: [
          ["batch", "ok", "qty"],
          ["B-1", true, 12],
        ],
      },
    ]);
    const document = await parseXlsxBuffer(buffer);
    expect(document.sheets).toHaveLength(1);
    expect(document.sheets[0]?.name).toBe("Results");
    expect(document.sheets[0]?.columns).toEqual(["batch", "ok", "qty"]);
    expect(document.sheets[0]?.rows[0]?.[0]).toBe("B-1");
    expect(document.sheets[0]?.rows[0]?.[1]).toBe("TRUE");
    expect(document.sheets[0]?.rows[0]?.[2]).toBe("12");
  });

  it("keeps multiple sheets and rejects a non-workbook buffer", async () => {
    const buffer = await xlsxFromRows([
      { name: "A", rows: [["h"], ["1"]] },
      { name: "B", rows: [["h"], ["2"]] },
    ]);
    const document = await parseXlsxBuffer(buffer);
    expect(document.sheets.map((sheet) => sheet.name)).toEqual(["A", "B"]);
    await expect(parseXlsxBuffer(Buffer.from("%PDF-1.7\n"))).rejects.toThrow(
      /not a valid Excel/i
    );
  });

  it("enforces the sheet cap before loading every worksheet", async () => {
    const buffer = await xlsxFromRows([
      { name: "A", rows: [["h"], ["1"]] },
      { name: "B", rows: [["h"], ["2"]] },
      { name: "C", rows: [["h"], ["3"]] },
    ]);
    await expect(parseXlsxBuffer(buffer, tightLimits)).rejects.toThrow(
      /too many sheets/i
    );
  });
});

describe("buildSpreadsheetPages / tables / summary", () => {
  it("windows long sheets into 80-row pages and keeps every window", () => {
    const rows = Array.from({ length: 90 }, (_, i) => [`r${i + 1}`, String(i)]);
    const pages = buildSpreadsheetPages(
      { sheets: [{ name: "Trend", columns: ["id", "n"], rows }] },
      80
    );
    expect(pages).toHaveLength(2);
    expect(pages[0]?.text).toContain("Sheet: Trend (rows 1–80)");
    expect(pages[1]?.text).toContain("Sheet: Trend (rows 81–90)");
    expect(pages[0]?.text).toContain("r1");
    expect(pages[1]?.text).toContain("r90");
  });

  it("escapes pipes in markdown cells", () => {
    const pages = buildSpreadsheetPages({
      sheets: [
        {
          name: "Notes",
          columns: ["a|b"],
          rows: [["c|d"]],
        },
      ],
    });
    expect(pages[0]?.text).toContain("a\\|b");
    expect(pages[0]?.text).toContain("c\\|d");
  });

  it("builds typed tables with page numbers from the windows", () => {
    const document = {
      sheets: [
        {
          name: "Results",
          columns: ["batch", "qty"],
          rows: [
            ["B-1", "12"],
            ["B-2", "13"],
          ],
        },
      ],
    };
    const pages = buildSpreadsheetPages(document);
    const tables = spreadsheetTables(document, pages);
    expect(tables).toHaveLength(1);
    expect(tables[0]?.signature).toBe("spreadsheet:Results");
    expect(tables[0]?.columns[1]?.type).toBe("number");
    expect(tables[0]?.rows[0]?.pageNumber).toBe(1);
    expect(spreadsheetSummary(document, 80)).toContain("Results (2 rows)");
  });
});
