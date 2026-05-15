import { describe, expect, it } from "vitest";
import { extractTextAlign, parseHtmlTables } from "@/lib/import/html-table-parser";

describe("html-table-parser merged cells", () => {
  it("extracts rowspan attribute from cells", () => {
    const html = `
      <table>
        <tr><td rowspan="3">Spanning</td><td>A1</td></tr>
        <tr><td>A2</td></tr>
        <tr><td>A3</td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    expect(tables).toHaveLength(1);

    const rows = tables[0]!.content!;
    expect(rows).toHaveLength(3);

    // First row: spanning cell with rowspan=3 + normal cell
    const firstRowCells = rows[0]!.content!;
    expect(firstRowCells).toHaveLength(2);
    expect(firstRowCells[0]!.attrs).toEqual({ rowspan: 3 });
    expect(firstRowCells[1]!.attrs).toBeUndefined();

    // Subsequent rows: only 1 cell each (covered by rowspan)
    expect(rows[1]!.content!).toHaveLength(1);
    expect(rows[2]!.content!).toHaveLength(1);
  });

  it("extracts colspan attribute from cells", () => {
    const html = `
      <table>
        <tr><th colspan="2">Wide Header</th></tr>
        <tr><td>Left</td><td>Right</td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    expect(tables).toHaveLength(1);

    const rows = tables[0]!.content!;
    const headerCells = rows[0]!.content!;
    expect(headerCells).toHaveLength(1);
    expect(headerCells[0]!.attrs).toEqual({ colspan: 2 });
  });

  it("extracts combined colspan and rowspan", () => {
    const html = `
      <table>
        <tr><td colspan="2" rowspan="2">Big Cell</td><td>C</td></tr>
        <tr><td>D</td></tr>
        <tr><td>E</td><td>F</td><td>G</td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    const rows = tables[0]!.content!;

    const bigCell = rows[0]!.content![0]!;
    expect(bigCell.attrs).toEqual({ colspan: 2, rowspan: 2 });
  });

  it("does not add attrs when colspan and rowspan are 1", () => {
    const html = `
      <table>
        <tr><td colspan="1" rowspan="1">Normal</td><td>Other</td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    const cell = tables[0]!.content![0]!.content![0]!;
    expect(cell.attrs).toBeUndefined();
  });

  it("pads short rows not covered by rowspans", () => {
    // Row 2 has only 1 cell but logical col count is 3 and no rowspan covers it
    const html = `
      <table>
        <tr><td>A</td><td>B</td><td>C</td></tr>
        <tr><td>X</td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    const rows = tables[0]!.content!;

    // Second row should be padded to 3 cells
    expect(rows[1]!.content!).toHaveLength(3);
  });
});

describe("html-table-parser cell text alignment", () => {
  it("sets cell align from centered <p> (mammoth-style)", () => {
    const html = `
      <table>
        <tr><td><p style="text-align: center">Centered</p></td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    const cell = tables[0]!.content![0]!.content![0]!;
    expect(cell.attrs?.align).toBe("center");
  });

  it("sets cell align from td style text-align", () => {
    const html = `
      <table>
        <tr><td style="text-align: right">Right</td></tr>
      </table>
    `;
    const tables = parseHtmlTables(html);
    const cell = tables[0]!.content![0]!.content![0]!;
    expect(cell.attrs?.align).toBe("right");
  });

  it("extractTextAlign returns null when paragraph alignments disagree", () => {
    expect(
      extractTextAlign(
        "",
        '<p style="text-align: left">a</p><p style="text-align: right">b</p>'
      )
    ).toBeNull();
  });
});
