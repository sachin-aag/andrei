import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { TableRow } from "@tiptap/extension-table-row";
import { docxBufferToImportedReportContent } from "@/lib/import/docx-to-sections";
import { parseHtmlTablesWithPositions } from "@/lib/import/html-table-parser";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { TableWithColumnWidths } from "@/lib/tiptap/table-column-widths";
import { TableCellWithVerticalAlign, TableHeaderWithVerticalAlign } from "@/lib/tiptap/table-cell-vertical-align";
import { BulletListWithStyle } from "@/lib/tiptap/bullet-list-with-style";
import { ImageInline } from "@/lib/tiptap/image-inline";
import { MathBlock, MathInline } from "@/lib/tiptap/math-nodes";

const fixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation DEV-PR-25-008.docx"
);

describe("DEV-PR-25-008 table import", () => {
  it("parses four nested data tables and TipTap accepts the measure doc", async () => {
    if (!fs.existsSync(fixturePath)) return;

    const buf = fs.readFileSync(fixturePath);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    const htmlTables = parseHtmlTablesWithPositions(html);
    expect(htmlTables).toHaveLength(4);

    const imported = await docxBufferToImportedReportContent(buf);
    const measure = imported.sections.measure.narrative;
    const tableNodes = (measure.content ?? []).filter((n) => n.type === "table");
    expect(tableNodes).toHaveLength(4);

    const schema = getSchema([
      StarterKit.configure({ heading: false, bulletList: false }),
      BulletListWithStyle,
      Subscript,
      Superscript,
      TextStyle,
      Color,
      ImageInline,
      MathInline,
      MathBlock,
      TableWithColumnWidths.configure({ resizable: false }),
      TableRow,
      TableCellWithVerticalAlign,
      TableHeaderWithVerticalAlign,
    ]);

    expect(() => schema.nodeFromJSON(measure)).not.toThrow();

    const airVelocity = tableNodes.find((t) =>
      richJsonToPlainText({ type: "doc", content: [t] }).includes("DF11")
    );
    expect(airVelocity).toBeDefined();
    expect(() => schema.nodeFromJSON({ type: "doc", content: [airVelocity!] })).not.toThrow();

    const flatParagraphs = (measure.content ?? [])
      .filter((n) => n.type === "paragraph")
      .map((n) => richJsonToPlainText(n).trim())
      .filter(Boolean);
    const tablePlain = richJsonToPlainText(measure, { tableFormat: "pipe" });
    const orphanGridLines = flatParagraphs.filter(
      (t) =>
        /^(TU-|DF\d|DF \d|Sr\. No\.|0\.\d+ micron)/i.test(t) ||
        (/^\d+(\.\d+)?$/.test(t) && t.length < 6)
    );
    expect(orphanGridLines, `orphan grid lines: ${orphanGridLines.join(" | ")}`).toEqual([]);
    expect(tablePlain).toMatch(/DF11/);
  });
});
