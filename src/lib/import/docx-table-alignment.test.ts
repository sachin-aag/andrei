import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  extractTableAlignmentSpecsFromDocumentXml,
  extractTblGridColumnWidthsDxa,
  mergeDocxAlignmentIntoTipTapTable,
} from "@/lib/import/docx-table-alignment";

const minimalTableXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vAlign w:val="center"/></w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="center"/></w:pPr>
            <w:r><w:t>H</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

describe("docx-table-alignment", () => {
  it("extractTblGridColumnWidthsDxa parses grid columns in document order", () => {
    const inner = `
<w:tblPr/>
<w:tblGrid><w:gridCol w:w="914"/><w:gridCol w:w="1829"/></w:tblGrid>`;
    expect(extractTblGridColumnWidthsDxa(inner)).toEqual([914, 1829]);
  });

  it("extracts gridCol widths into specs alongside alignment", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblGrid><w:gridCol w:w="500"/><w:gridCol w:w="1500"/></w:tblGrid>
      <w:tr>
        <w:tc><w:p><w:r><w:t>U</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>V</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);
    expect(specs[0]!.gridColWidths).toEqual([500, 1500]);
  });

  it("copies OOXML tblGrid widths onto TipTap attrs when logical column counts match", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tblGrid><w:gridCol w:w="100"/><w:gridCol w:w="200"/></w:tblGrid>
      <w:tr>
        <w:tc><w:p><w:r><w:t>X</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Y</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);

    const table: JSONContent = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "X" }] }],
            },
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Y" }] }],
            },
          ],
        },
      ],
    };

    expect(mergeDocxAlignmentIntoTipTapTable(table, specs[0])).toBe(true);
    expect(table.attrs?.colWidths).toEqual([100, 200]);
  });

  it("extracts horizontal jc and vertical vAlign from OOXML", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(minimalTableXml);
    expect(specs).toHaveLength(1);
    const cell = specs[0]!.rawRows[0]![0]!;
    expect(cell.hAlign).toBe("center");
    expect(cell.vAlign).toBe("middle");
    expect(specs[0]!.rowTexts[0]![0]).toBe("H");
  });

  it("maps Word justify (w:jc both) to center for table cells", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>1</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);
    expect(specs[0]!.rawRows[0]![0]!.hAlign).toBe("center");
  });

  it("reads jc from a later paragraph when the first has no pPr", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>a</w:t></w:r></w:p>
          <w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>b</w:t></w:r></w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);
    expect(specs[0]!.rawRows[0]![0]!.hAlign).toBe("right");
  });

  it("merges alignment into TipTap table cells using row walk + vMerge skip", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
          <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Date</w:t></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>X</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:tcPr><w:vMerge/></w:tcPr>
          <w:p><w:r><w:t/></w:r></w:p>
        </w:tc>
        <w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Y</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);

    const table: JSONContent = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Date" }] }],
            },
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "X" }] }],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Y" }] }],
            },
          ],
        },
      ],
    };

    expect(mergeDocxAlignmentIntoTipTapTable(table, specs[0])).toBe(true);
    const r0 = table.content![0]!.content!;
    expect(r0[0]!.attrs).toMatchObject({ align: "center" });
    expect(r0[1]!.attrs).toBeUndefined();
    expect(table.content![1]!.content![0]!.attrs).toMatchObject({ align: "right" });
  });

  it("merges a mammoth-sized sub-table against a header-matched slice of a large Word table", () => {
    const specs = extractTableAlignmentSpecsFromDocumentXml(`
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Ignore</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t>A</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>B</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>C</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>D</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`);

    const table: JSONContent = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
            },
            {
              type: "tableHeader",
              content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "C" }] }],
            },
            {
              type: "tableCell",
              content: [{ type: "paragraph", content: [{ type: "text", text: "D" }] }],
            },
          ],
        },
      ],
    };

    expect(mergeDocxAlignmentIntoTipTapTable(table, specs[0])).toBe(true);
    const hdr = table.content![0]!.content!;
    expect(hdr[0]!.attrs).toMatchObject({ align: "center" });
    expect(hdr[1]!.attrs).toMatchObject({ align: "center" });
    const data = table.content![1]!.content!;
    expect(data[0]!.attrs).toMatchObject({ align: "right" });
  });
});
