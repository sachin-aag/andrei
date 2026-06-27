import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { reports } from "@/db/schema";
import { hydrateUserDirectory } from "@/lib/auth/user-directory";
import { createDocxExportContext } from "@/lib/export/docx-export-context";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { loadListNumberingBasesFromZip } from "@/lib/export/docx-numbering";
import {
  narrativeToDocxXml,
  narrativeToDocxXmlWithContext,
  plainTextToDocxXml,
} from "@/lib/export/narrative-to-docx-xml";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import type { ReportSectionRecord } from "@/types/report";
import { EMPTY_CONTENT, REPORT_SECTION_ROW_ORDER } from "@/types/sections";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "investigation-report-template.docx"
);

function exportCtx() {
  const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
  return createDocxExportContext(loadListNumberingBasesFromZip(zip));
}

function textCell(
  type: "tableCell" | "tableHeader",
  text: string,
  attrs?: JSONContent["attrs"]
): JSONContent {
  return {
    type,
    attrs,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function tableRows(xml: string): string[] {
  return [...xml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
}

/**
 * Tables are emitted wrapped in a single-row "keep-together" outer table.
 * This returns just the rows of the inner table the test cares about.
 */
function innerTableRows(xml: string): string[] {
  const innerMatch = xml.match(/<w:tbl>[\s\S]*?<w:tbl>([\s\S]*?)<\/w:tbl>/);
  return innerMatch ? tableRows(innerMatch[1]!) : [];
}

function hasWrapperRowWithCantSplit(xml: string): boolean {
  // The wrapper row immediately follows the outer <w:tblGrid>. Its <w:trPr>
  // must include <w:cantSplit/> — that is what keeps the inner table glued
  // together across a page break.
  return /<\/w:tblGrid>\s*<w:tr>\s*<w:trPr>[^<]*<w:cantSplit\/>/.test(xml);
}

function cellCount(rowXml: string): number {
  return (rowXml.match(/<w:tc>/g) ?? []).length;
}

describe("narrativeToDocxXml tables", () => {
  it("pins exported rich text runs to the template font", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Narrative text" }],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain(
      '<w:rFonts w:ascii="Times New Roman" w:eastAsia="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
    );
    expect(xml).toContain('<w:sz w:val="24"/>');
    expect(xml).toContain('<w:jc w:val="left"/>');
  });

  it("exports bold, italic, and underline marks to OOXML", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Bold",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: "Italic",
              marks: [{ type: "italic" }],
            },
            {
              type: "text",
              text: "Underline",
              marks: [{ type: "underline" }],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("<w:i/>");
    expect(xml).toContain('<w:u w:val="single"/>');
    expect(xml).toContain("Bold");
    expect(xml).toContain("Italic");
    expect(xml).toContain("Underline");
  });

  it("exports textStyle color marks to OOXML", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Red text",
              marks: [{ type: "textStyle", attrs: { color: "#FF0000" } }],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain('<w:color w:val="FF0000"/>');
    expect(xml).toContain("Red text");
  });

  it("exports suggestion insert marks as native Word insert revisions", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Added text",
              marks: [
                {
                  type: suggestionInsertMarkName,
                  attrs: {
                    id: "101",
                    authorId: "user-1",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain(
      '<w:ins w:id="101" w:author="user-1" w:date="2026-01-01T00:00:00.000Z">'
    );
    expect(xml).toContain('<w:t xml:space="preserve">Added text</w:t>');
    expect(xml).toContain("</w:ins>");
    expect(xml).not.toContain("<w:highlight");
    expect(xml).not.toContain("<w:strike/>");
  });

  it("resolves track-change authorId to workspace user name when directory is hydrated", () => {
    hydrateUserDirectory([
      {
        id: "9",
        name: "Bhargav Patel",
        email: "bhargav.patel@mjbiopharm.com",
        role: "manager",
        title: "Quality Manager",
      },
    ]);

    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Testing Track changes function.",
              marks: [
                {
                  type: suggestionInsertMarkName,
                  attrs: {
                    id: "101",
                    authorId: "9",
                    createdAt: "2026-06-23T10:51:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain('w:author="Bhargav Patel"');
    expect(xml).not.toContain('w:author="9"');
  });

  it("exports suggestion delete marks as native Word delete revisions", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Removed text",
              marks: [
                {
                  type: suggestionDeleteMarkName,
                  attrs: {
                    id: "102",
                    authorId: "user-2",
                    createdAt: "2026-01-02T00:00:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain(
      '<w:del w:id="102" w:author="user-2" w:date="2026-01-02T00:00:00.000Z">'
    );
    expect(xml).toContain('<w:delText xml:space="preserve">Removed text</w:delText>');
    expect(xml).toContain("</w:del>");
    expect(xml).not.toContain('<w:t xml:space="preserve">Removed text</w:t>');
    expect(xml).not.toContain("<w:highlight");
    expect(xml).not.toContain("<w:strike/>");
  });

  it("preserves direct formatting inside native Word delete revisions", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Deleted red",
              marks: [
                {
                  type: suggestionDeleteMarkName,
                  attrs: {
                    id: "103",
                    authorId: "user-3",
                    createdAt: "2026-01-03T00:00:00.000Z",
                    status: "pending",
                  },
                },
                { type: "textStyle", attrs: { color: "#FF0000" } },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    expect(xml).toContain(
      '<w:del w:id="103" w:author="user-3" w:date="2026-01-03T00:00:00.000Z">'
    );
    expect(xml).toContain('<w:color w:val="FF0000"/>');
    expect(xml).toContain('<w:delText xml:space="preserve">Deleted red</w:delText>');
    expect(xml).not.toContain("<w:highlight");
  });

  it("keeps native Word revisions through full report DOCX generation", async () => {
    const reportId = "test-report-native-revisions";
    const iso = new Date("2026-01-01T00:00:00.000Z");
    const narrative: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Original ",
            },
            {
              type: "text",
              text: "added",
              marks: [
                {
                  type: suggestionInsertMarkName,
                  attrs: {
                    id: "201",
                    authorId: "engineer-1",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
            {
              type: "text",
              text: " removed",
              marks: [
                {
                  type: suggestionDeleteMarkName,
                  attrs: {
                    id: "202",
                    authorId: "manager-1",
                    createdAt: "2026-01-02T00:00:00.000Z",
                    status: "pending",
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const sections: ReportSectionRecord[] = REPORT_SECTION_ROW_ORDER.map((section, i) => ({
      id: `sec-${section}-${i}`,
      reportId,
      section,
      content:
        section === "define"
          ? { ...EMPTY_CONTENT.define, narrative }
          : EMPTY_CONTENT[section],
      updatedAt: iso.toISOString(),
    }));
    const report: typeof reports.$inferSelect = {
      id: reportId,
      deviationNo: "DEV/TEST/REVISIONS",
      date: iso,
      toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
      otherTools: "",
      status: "draft",
      authorId: "1",
      assignedManagerId: null,
      reviewedById: null,
      deletedAt: null,
      deletedById: null,
      createdAt: iso,
      updatedAt: iso,
    };

    const buf = await generateReportDocx({ report, sections });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    expect(xml).toContain(
      '<w:ins w:id="201" w:author="engineer-1" w:date="2026-01-01T00:00:00.000Z">'
    );
    expect(xml).toContain('<w:t xml:space="preserve">added</w:t>');
    expect(xml).toContain(
      '<w:del w:id="202" w:author="manager-1" w:date="2026-01-02T00:00:00.000Z">'
    );
    expect(xml).toContain('<w:delText xml:space="preserve"> removed</w:delText>');
    expect(xml).not.toContain("<w:highlight");
  });

  it("emits Word vertical merge continuation cells for rowspans", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Sr. No."),
                textCell("tableHeader", "Date"),
                textCell("tableHeader", "Time in Hrs."),
                textCell("tableHeader", "Activity"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "1"),
                textCell("tableCell", "20/11/2025", { rowspan: 3 }),
                textCell("tableCell", "01:07"),
                textCell("tableCell", "Chamber cleaning performed"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "2"),
                textCell("tableCell", "02:28"),
                textCell("tableCell", "Hot leak test performed"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "3"),
                textCell("tableCell", "03:09"),
                textCell("tableCell", "Bowie dick test performed"),
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    const rows = innerTableRows(xml);

    expect(rows).toHaveLength(4);
    expect(rows.map(cellCount)).toEqual([4, 4, 4, 4]);
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml.match(/<w:vMerge w:val="continue"\/>/g)).toHaveLength(2);
  });

  it("uses table.attrs.colWidths for w:tblGrid when length matches logical columns", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { colWidths: [800, 1200] },
          content: [
            {
              type: "tableRow",
              content: [textCell("tableHeader", "A"), textCell("tableHeader", "B")],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain('<w:tblW w:w="2000" w:type="dxa"/>');
    expect(xml).toContain('<w:gridCol w:w="800"/>');
    expect(xml).toContain('<w:gridCol w:w="1200"/>');
  });

  it("defaults w:tblGrid column widths so the sum stays within a Letter content band", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "C1"),
                textCell("tableHeader", "C2"),
                textCell("tableHeader", "C3"),
                textCell("tableHeader", "C4"),
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    const innerMatch = xml.match(/<w:tbl>[\s\S]*?(<w:tbl>[\s\S]*?<\/w:tbl>)/);
    const innerXml = innerMatch?.[1] ?? "";
    const cols = [...innerXml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    expect(cols).toHaveLength(4);
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(10469 + 100);
    expect(sum).toBeGreaterThan(9000);
  });

  it("keeps tables together across page breaks when they fit", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [textCell("tableHeader", "H1"), textCell("tableHeader", "H2")],
            },
            {
              type: "tableRow",
              content: [textCell("tableCell", "A"), textCell("tableCell", "B")],
            },
            {
              type: "tableRow",
              content: [textCell("tableCell", "C"), textCell("tableCell", "D")],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);

    // The wrapper table is what actually keeps the inner table together: a
    // single-row outer table whose row carries cantSplit. Word treats the
    // wrapper row as atomic and refuses to break across page boundaries.
    expect(hasWrapperRowWithCantSplit(xml)).toBe(true);

    const inner = innerTableRows(xml);
    expect(inner).toHaveLength(3);
    for (const row of inner) {
      expect(row).toContain("<w:cantSplit/>");
    }
    expect(inner[0]).toContain("<w:keepNext/>");
    expect(inner[1]).toContain("<w:keepNext/>");
    expect(inner[2]).not.toContain("<w:keepNext/>");
  });

  it("scales oversized colWidths so the grid does not clip the right edge", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { colWidths: [5000, 4000, 4000] },
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Description"),
                textCell("tableHeader", "Unit"),
                textCell("tableHeader", "Value"),
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    const innerMatch = xml.match(/<w:tbl>[\s\S]*?(<w:tbl>[\s\S]*?<\/w:tbl>)/);
    const innerXml = innerMatch?.[1] ?? "";
    const cols = [...innerXml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(10469);
    expect(innerXml).toContain(`<w:tblW w:w="${sum}" w:type="dxa"/>`);
  });

  it("emits Word gridSpan for colspans", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [textCell("tableHeader", "Wide", { colspan: 2 })],
            },
            {
              type: "tableRow",
              content: [textCell("tableCell", "A"), textCell("tableCell", "B")],
            },
          ],
        },
      ],
    };

    expect(narrativeToDocxXml(doc)).toContain('<w:gridSpan w:val="2"/>');
  });

  it("emits Word numbering for dash and ordered lists", () => {
    const ctx = exportCtx();
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          attrs: { listStyle: "dash" },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Dash item" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Numbered item" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXmlWithContext(doc, ctx).xml;
    const dashNumId = ctx.allocatedNumIds[0];
    const orderedNumId = ctx.allocatedNumIds[1];
    expect(xml).toContain(`<w:numId w:val="${dashNumId}"/>`);
    expect(xml).toContain(`<w:numId w:val="${orderedNumId}"/>`);
    expect(dashNumId).not.toBe(orderedNumId);
    expect(xml).toContain("Dash item");
    expect(xml).toContain("Numbered item");
  });

  it("allocates a fresh numId per ordered list block", () => {
    const ctx = exportCtx();
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Define one" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Measure one" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXmlWithContext(doc, ctx).xml;
    const [defineNumId, measureNumId] = ctx.allocatedNumIds;
    expect(defineNumId).toBeDefined();
    expect(measureNumId).toBeDefined();
    expect(defineNumId).not.toBe(measureNumId);
    expect(xml).toContain(`<w:numId w:val="${defineNumId}"/>`);
    expect(xml).toContain(`<w:numId w:val="${measureNumId}"/>`);
  });

  it("parses plain text dash lists into numbered Word XML", () => {
    const ctx = exportCtx();
    const xml = plainTextToDocxXml("- First\n- Second", ctx);
    expect(ctx.allocatedNumIds).toHaveLength(1);
    expect(xml).toContain(`<w:numId w:val="${ctx.allocatedNumIds[0]}"/>`);
    expect(xml).toContain("First");
    expect(xml).toContain("Second");
  });

  it("uses one ordered list for 5-Why chains so numbering runs 1, 2, 3…", () => {
    const ctx = exportCtx();
    const xml = plainTextToDocxXml(
      [
        "1. WHY: Why did the deviation occur?",
        "Ans. TOC value was not captured.",
        "",
        "2. WHY: Why was the blank water not calibrated?",
        "Ans. Calibration was skipped.",
      ].join("\n"),
      ctx
    );
    expect(ctx.allocatedNumIds).toHaveLength(1);
    const numId = ctx.allocatedNumIds[0]!;
    const numPrCount = (xml.match(new RegExp(`<w:numId w:val="${numId}"/>`, "g")) ?? [])
      .length;
    expect(numPrCount).toBe(2);
    expect(xml).toContain("WHY: Why did the deviation occur?");
    expect(xml).toContain("Ans. TOC value was not captured.");
    expect(xml).toContain("WHY: Why was the blank water not calibrated?");
  });

  it("strips bookmark anchors and preserves full list item text on export", () => {
    const ctx = exportCtx();
    const xml = plainTextToDocxXml(
      [
        "Following checkpoint shall be considered",
        '27. <a id="_Hlk178957085"></a>Is the Corrective action assigned a unique number',
      ].join("\n"),
      ctx
    );
    expect(xml).not.toContain("_Hlk");
    expect(xml).not.toContain("<a id");
    expect(xml).toContain("Is the Corrective action assigned a unique number");
  });
});

describe("narrativeToDocxXml advanced formatting", () => {
  it("exports subscript and superscript vertAlign", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "H" },
            { type: "text", text: "2", marks: [{ type: "subscript" }] },
            { type: "text", text: "O" },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
  });

  it("exports inline images as drawing markup", () => {
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const ctx = createDocxExportContext();
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "imageInline",
              attrs: { src: tinyPng, width: 10 },
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc, ctx);
    expect(xml).toContain("<w:drawing>");
    expect(ctx.media).toHaveLength(1);
  });

  it("exports inline math as OMML", () => {
    const mathml =
      '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow><mn>2</mn><mo>+</mo><mn>2</mn></mrow></math>';
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "mathInline",
              attrs: { mathml, ommlDirty: true },
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain("<m:oMath");
  });

  it("exports inline math from latex-only attrs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Formula: " },
            {
              type: "mathInline",
              attrs: {
                mathml: "",
                latex: String.raw`\frac{a}{b}`,
                omml: null,
                ommlDirty: true,
              },
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain("<m:oMath");
  });
});
