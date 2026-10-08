import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { reports } from "@/db/schema";
import { hydrateUserDirectory } from "@/lib/auth/user-directory";
import {
  CONVERGENT_DOCX_RUN_STYLE,
  CVP_DOCX_RUN_STYLE,
  QSR_DOCX_RUN_STYLE,
  VQ_DOCX_RUN_STYLE,
  createDocxExportContext,
} from "@/lib/export/docx-export-context";
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

function nColTable(columnCount: number, colWidths?: number[]): JSONContent {
  return {
    type: "table",
    attrs: colWidths ? { colWidths } : undefined,
    content: [
      {
        type: "tableRow",
        content: Array.from({ length: columnCount }, (_, i) =>
          textCell("tableHeader", `C${i + 1}`)
        ),
      },
    ],
  };
}

function tableRows(xml: string): string[] {
  return [...xml.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
}

function firstTblPr(xml: string): string {
  return xml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
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

  it("renders heading nodes as bold paragraphs unless useHeadingStyles is set", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Scope" }],
        },
      ],
    };

    const defaultXml = narrativeToDocxXml(doc);
    expect(defaultXml).not.toContain('<w:pStyle w:val="Heading2"/>');
    expect(defaultXml).toContain("<w:b/>");

    const styled = narrativeToDocxXmlWithContext(
      doc,
      createDocxExportContext(undefined, undefined, { useHeadingStyles: true })
    ).xml;
    expect(styled).toContain('<w:pStyle w:val="Heading2"/>');
    expect(styled).toContain("Scope");
  });

  it("uses Solea DV paragraph, list, and table formatting for Convergent", () => {
    const ctx = createDocxExportContext(
      { decimal: 0, disc: 0, dash: 0, maxNumId: 0 },
      CONVERGENT_DOCX_RUN_STYLE
    );
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Purpose body" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "mm: major release" }],
                },
              ],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [textCell("tableHeader", "Req. ID"), textCell("tableHeader", "P/F")],
            },
            {
              type: "tableRow",
              content: [textCell("tableCell", "SW-IN-1"), textCell("tableCell", "Pass")],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc, ctx);

    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).toContain('<w:sz w:val="20"/>');
    expect(xml).toContain('<w:jc w:val="both"/>');
    expect(xml).toContain('<w:spacing w:before="60" w:after="60"/>');
    expect(xml).toContain('<w:pStyle w:val="ListParagraph"/>');
    expect(xml).toContain("mm: major release");
    expect(xml).toContain('<w:tblStyle w:val="TableGrid"/>');
    expect(xml).toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain('w:fill="C6D9F1"');
    expect(xml).toContain('<w:vAlign w:val="center"/>');
    expect(xml).toContain('<w:sz w:val="18"/>');
    expect(xml).toContain('w:color="000000"');
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1);
    expect(xml).not.toContain("<w:top w:val=\"nil\"/>");
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

  it("puts spaces beside bold in a separate run so Word Online cannot collapse them", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "associated " },
            { type: "text", text: "Tray Loader", marks: [{ type: "bold" }] },
            { type: "text", text: " (Make:" },
            { type: "text", text: "Steriline", marks: [{ type: "bold" }] },
            { type: "text", text: ")" },
          ],
        },
      ],
    });

    expect(xml).toContain('<w:t xml:space="preserve">associated</w:t>');
    expect(xml).toContain("<w:noProof/>");
    expect(xml).toContain('<w:t xml:space="preserve"> </w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">Tray Loader</w:t>');
    expect(xml).toContain("<w:b/>");
    expect(xml).not.toContain("associatedTray");
    expect(xml).not.toContain('preserve">associated </w:t>');
  });

  it("peels a leading space off a bold run after a colon label", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Make:", marks: [{ type: "bold" }] },
            { type: "text", text: " Steriline S.R.L." },
          ],
        },
      ],
    });

    expect(xml).toContain('<w:t xml:space="preserve">Make:</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve"> </w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">Steriline S.R.L.</w:t>');
    expect(xml).not.toContain("Make:Steriline");
    expect(xml).not.toContain('preserve"> Steriline');
  });

  it("does not emit two spaces when both nodes already carry the gap", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "associated " },
            { type: "text", text: " Tray Loader", marks: [{ type: "bold" }] },
          ],
        },
      ],
    });

    expect(xml.match(/<w:t xml:space="preserve"> <\/w:t>/g)).toHaveLength(1);
    expect(xml).toContain('<w:t xml:space="preserve">associated</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">Tray Loader</w:t>');
  });

  it("does not insert noProof runs in an all-plain paragraph", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello world" }],
        },
      ],
    });

    expect(xml).toContain('<w:t xml:space="preserve">hello world</w:t>');
    expect(xml).not.toContain("<w:noProof/>");
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
      documentType: "investigation_report",
      documentNo: "DEV/TEST/REVISIONS",
      date: iso,
      metadata: {
        toolsUsed: { sixM: false, fiveWhy: false, brainstorming: false },
        otherTools: "",
      },
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
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
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

  it("does not rotate a 4-column table onto a landscape page", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [nColTable(4)],
    });
    expect(xml).not.toContain('w:orient="landscape"');
  });

  it("does not rotate a 7-column table onto a landscape page", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [nColTable(7)],
    });
    expect(xml).not.toContain('w:orient="landscape"');
  });

  it("forceLandscapeTables rotates a 4-column table onto a landscape page", () => {
    const xml = narrativeToDocxXml(
      {
        type: "doc",
        content: [nColTable(4)],
      },
      undefined,
      { forceLandscapeTables: true }
    );
    expect(xml).toContain('w:orient="landscape"');
    expect(xml.indexOf("w:orient")).toBeGreaterThan(xml.indexOf("<w:tbl>"));

    const innerMatch = xml.match(/<w:tbl>[\s\S]*?(<w:tbl>[\s\S]*?<\/w:tbl>)/);
    const innerXml = innerMatch?.[1] ?? "";
    const cols = [...innerXml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    expect(cols).toHaveLength(4);
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(10469);
    expect(sum).toBeLessThanOrEqual(15394);
  });

  it("keeps trailing paragraphs in the landscape section when forceLandscapeTables is on", () => {
    const xml = narrativeToDocxXml(
      {
        type: "doc",
        content: [
          nColTable(4),
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "*See Deviation #02, deemed Not Applicable to the current testing execution*",
              },
            ],
          },
        ],
      },
      undefined,
      { forceLandscapeTables: true }
    );
    const footnoteAt = xml.indexOf("Deviation #02");
    const landscapeAt = xml.indexOf('w:orient="landscape"');
    expect(footnoteAt).toBeGreaterThan(-1);
    expect(landscapeAt).toBeGreaterThan(footnoteAt);
  });

  it("puts an 8-column table on a landscape section and uses the landscape content band", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [nColTable(8)],
    });

    expect(xml).toContain('w:orient="landscape"');
    expect(xml).toMatch(
      /<w:p><w:pPr><w:spacing w:before="0" w:after="0"\/><w:sectPr>/
    );
    expect(xml.indexOf("w:orient")).toBeGreaterThan(xml.indexOf("<w:tbl>"));

    const innerMatch = xml.match(/<w:tbl>[\s\S]*?(<w:tbl>[\s\S]*?<\/w:tbl>)/);
    const innerXml = innerMatch?.[1] ?? "";
    const cols = [...innerXml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    expect(cols).toHaveLength(8);
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(10469);
    expect(sum).toBeLessThanOrEqual(15394);
  });

  it("stretches stored 8-column widths to the landscape content band", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        nColTable(8, [460, 1172, 1172, 983, 915, 1407, 1595, 2178]),
      ],
    });
    expect(xml).toContain('w:orient="landscape"');
    const innerMatch = xml.match(/<w:tbl>[\s\S]*?(<w:tbl>[\s\S]*?<\/w:tbl>)/);
    const innerXml = innerMatch?.[1] ?? "";
    const cols = [...innerXml.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    expect(cols).toHaveLength(8);
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(sum).toBe(15394);
  });

  it("keeps consecutive wide tables in one landscape section", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [nColTable(8), nColTable(9)],
    });
    const landscapeBreaks = xml.match(/w:orient="landscape"/g) ?? [];
    expect(landscapeBreaks).toHaveLength(1);
    expect(xml).toContain("C1");
    expect(xml).toContain("C9");
  });

  it("returns to portrait after a wide table so following paragraphs stay upright", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        nColTable(8),
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    });
    const beforeAt = xml.indexOf("Before");
    const landscapeAt = xml.indexOf('w:orient="landscape"');
    const afterAt = xml.indexOf("After");
    expect(beforeAt).toBeGreaterThan(-1);
    expect(landscapeAt).toBeGreaterThan(beforeAt);
    expect(afterAt).toBeGreaterThan(landscapeAt);
  });

  it("opens the landscape section before the table name so the caption stays with the table", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Assessment stays portrait." }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Table 3. Qualification and periodic re-qualification history",
            },
          ],
        },
        nColTable(8),
      ],
    });
    const assessmentAt = xml.indexOf("Assessment stays portrait");
    const breakAt = xml.indexOf("<w:sectPr>");
    const captionAt = xml.indexOf("Table 3. Qualification");
    const tableAt = xml.indexOf("<w:tbl>");
    const landscapeAt = xml.indexOf('w:orient="landscape"');
    expect(assessmentAt).toBeGreaterThan(-1);
    expect(breakAt).toBeGreaterThan(assessmentAt);
    expect(captionAt).toBeGreaterThan(breakAt);
    expect(tableAt).toBeGreaterThan(captionAt);
    expect(landscapeAt).toBeGreaterThan(tableAt);
    const captionPara = xml.slice(
      xml.lastIndexOf("<w:p>", captionAt),
      xml.indexOf("</w:p>", captionAt)
    );
    expect(captionPara).toContain("<w:keepNext/>");
  });

  it("keeps a split table name and table title on the landscape page", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Table 1." }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Associated instruments" }],
        },
        nColTable(8),
      ],
    });
    const breakAt = xml.indexOf("<w:sectPr>");
    const nameAt = xml.indexOf("Table 1.");
    const titleAt = xml.indexOf("Associated instruments");
    const tableAt = xml.indexOf("<w:tbl>");
    expect(nameAt).toBeGreaterThan(breakAt);
    expect(titleAt).toBeGreaterThan(nameAt);
    expect(tableAt).toBeGreaterThan(titleAt);
  });

  it("does not pull a preceding assessment paragraph onto the landscape page", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Nine qualification stages were reviewed this period.",
            },
          ],
        },
        nColTable(8),
      ],
    });
    const assessmentAt = xml.indexOf("Nine qualification stages");
    const breakAt = xml.indexOf("<w:sectPr>");
    const tableAt = xml.indexOf("<w:tbl>");
    expect(assessmentAt).toBeGreaterThan(-1);
    expect(breakAt).toBeGreaterThan(assessmentAt);
    expect(tableAt).toBeGreaterThan(breakAt);
  });

  it("keeps a portrait table caption on the same page with keepNext", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table 1. Abbreviations" }],
        },
        nColTable(4),
      ],
    });
    expect(xml).not.toContain('w:orient="landscape"');
    const captionAt = xml.indexOf("Table 1. Abbreviations");
    const captionPara = xml.slice(
      xml.lastIndexOf("<w:p>", captionAt),
      xml.indexOf("</w:p>", captionAt)
    );
    expect(captionPara).toContain("<w:keepNext/>");
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

  it("exports bullet and ordered lists inside a table cell", () => {
    const ctx = exportCtx();
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Department"),
                textCell("tableHeader", "Responsibility"),
              ],
            },
            {
              type: "tableRow",
              content: [
                textCell("tableCell", "Quality Assurance"),
                {
                  type: "tableCell",
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
                              content: [
                                {
                                  type: "text",
                                  text: "Preparation and review of the protocol.",
                                },
                              ],
                            },
                          ],
                        },
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [
                                { type: "text", text: "Collection of swab samples." },
                              ],
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
                              content: [
                                { type: "text", text: "Submit the samples to QC." },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXmlWithContext(doc, ctx).xml;
    const bulletNumId = ctx.allocatedNumIds[0];
    const orderedNumId = ctx.allocatedNumIds[1];
    const cellStart = xml.indexOf("Preparation and review of the protocol.");
    const cellXml = xml.slice(
      xml.lastIndexOf("<w:tc>", cellStart),
      xml.indexOf("</w:tc>", cellStart)
    );

    expect(cellXml).toContain("Preparation and review of the protocol.");
    expect(cellXml).toContain("Collection of swab samples.");
    expect(cellXml).toContain("Submit the samples to QC.");
    expect(cellXml.match(new RegExp(`<w:numId w:val="${bulletNumId}"/>`, "g"))).toHaveLength(2);
    expect(cellXml).toContain(`<w:numId w:val="${orderedNumId}"/>`);
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

  it("nests a same-type ordered list at the next numbering level", () => {
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
                  content: [{ type: "text", text: "Parent" }],
                },
                {
                  type: "orderedList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Child" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const xml = narrativeToDocxXmlWithContext(doc, ctx).xml;
    expect(ctx.allocatedNumIds).toHaveLength(1);
    const numId = ctx.allocatedNumIds[0]!;
    expect(xml).toContain(
      `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`
    );
    expect(xml).toContain(
      `<w:numPr><w:ilvl w:val="1"/><w:numId w:val="${numId}"/></w:numPr>`
    );
  });

  it("uses TableParagraph bullets and drops Table N. captions for CVP", () => {
    const ctx = createDocxExportContext(undefined, CVP_DOCX_RUN_STYLE, {
      useHeadingStyles: true,
    });
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Table 2. Responsibilities" }],
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "15.1 Mixed Vessel (MV-1304)" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Sampling follows the cited pages [1]." }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 3]" }],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                textCell("tableHeader", "Department"),
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [
                                { type: "text", text: "Prepare the protocol." },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const xml = narrativeToDocxXmlWithContext(doc, ctx).xml;
    expect(xml).not.toContain("Table 2. Responsibilities");
    expect(xml).toContain("MIXED VESSEL (MV-1304)");
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).not.toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('<w:pStyle w:val="TableParagraph"/>');
    expect(xml).not.toContain('<w:pStyle w:val="ListParagraph"/>');
    expect(xml).toContain("Sampling follows the cited pages.");
    expect(xml).not.toContain("[1]");
    expect(xml).toContain('<w:pStyle w:val="BodyText"/>');
    expect(xml).toContain('w:line="360"');
    expect(xml).toContain("<w:widowControl/>");
  });

  it("uses source protocol column widths and dxa table width for CVP", () => {
    const ctx = createDocxExportContext(undefined, CVP_DOCX_RUN_STYLE, {
      useHeadingStyles: true,
    });
    const xml = narrativeToDocxXmlWithContext(
      {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  textCell("tableHeader", "Function"),
                  textCell("tableHeader", "Department"),
                  textCell("tableHeader", "Name"),
                  textCell("tableHeader", "Designation"),
                  textCell("tableHeader", "Sign & date"),
                ],
              },
            ],
          },
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  textCell("tableHeader", "S. No"),
                  textCell("tableHeader", "Surface Type"),
                  textCell("tableHeader", "WAF (L/m²)"),
                ],
              },
            ],
          },
        ],
      },
      ctx
    ).xml;
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain('<w:gridCol w:w="1524"/>');
    expect(xml).toContain('<w:gridCol w:w="2340"/>');
    expect(xml).toContain('<w:gridCol w:w="2225"/>');
    expect(xml).toContain('<w:gridCol w:w="2020"/>');
    expect(xml).toContain('<w:gridCol w:w="1773"/>');
    expect(xml).toContain('<w:tblW w:w="9882" w:type="dxa"/>');
    expect(xml).toContain('<w:gridCol w:w="838"/>');
    expect(xml).toContain('<w:gridCol w:w="3251"/>');
    expect(xml).toContain('<w:gridCol w:w="1996"/>');
    expect(xml).toContain('<w:tblW w:w="6085" w:type="dxa"/>');
    expect(xml).not.toContain('<w:tblW w:w="5000" w:type="pct"/>');
    expect(xml).toContain('w:fill="FFFF00"');
    expect(xml).not.toContain('w:fill="D9D9D9"');
    expect(xml).toContain('<w:jc w:val="center"/>');
  });

  it("centers 3xper narrative tables and uses TableGrid print chrome", () => {
    const ctx = createDocxExportContext(undefined, CVP_DOCX_RUN_STYLE, {
      useHeadingStyles: true,
    });
    const xml = narrativeToDocxXmlWithContext(
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Worst-case surface factor." }],
          },
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  textCell("tableHeader", "S. No"),
                  textCell("tableHeader", "Surface Type"),
                  textCell("tableHeader", "WAF (L/m²)"),
                ],
              },
              {
                type: "tableRow",
                content: [
                  textCell("tableCell", "1"),
                  textCell("tableCell", "Polished Stainless Steel"),
                  textCell("tableCell", "0.1-0.3"),
                ],
              },
            ],
          },
        ],
      },
      ctx
    ).xml;
    const tblPr = firstTblPr(xml);
    expect(tblPr).toContain('<w:jc w:val="center"/>');
    expect(tblPr).toContain('<w:tblCellMar>');
    expect(tblPr).toContain('<w:left w:w="108" w:type="dxa"/>');
    expect(tblPr).toContain('<w:right w:w="108" w:type="dxa"/>');
    expect(tblPr).not.toContain("<w:tblBorders>");
    expect(tblPr).toContain('<w:tblStyle w:val="TableGrid"/>');
    expect(xml).not.toContain('<w:tblW w:w="5000" w:type="pct"/>');
    const rows = tableRows(xml);
    expect(rows[0]).toContain("<w:tblHeader/>");
    expect(rows[0]).not.toContain("<w:cantSplit/>");
    expect(rows[1]).not.toContain("<w:cantSplit/>");
    expect(xml).toContain("<w:widowControl/>");
    expect(xml).not.toMatch(/<w:tc[\s\S]*?<w:widowControl\/>/);
  });

  it("applies the same table chrome to QSR overflow and VQ narrative tables", () => {
    for (const style of [QSR_DOCX_RUN_STYLE, VQ_DOCX_RUN_STYLE]) {
      const xml = narrativeToDocxXmlWithContext(
        {
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    textCell("tableHeader", "Item"),
                    textCell("tableHeader", "Value"),
                  ],
                },
                {
                  type: "tableRow",
                  content: [
                    textCell("tableCell", "A"),
                    textCell("tableCell", "B"),
                  ],
                },
              ],
            },
          ],
        },
        createDocxExportContext(undefined, style)
      ).xml;
      const tblPr = firstTblPr(xml);
      expect(tblPr).toContain('<w:jc w:val="center"/>');
      expect(tblPr).toContain("<w:tblCellMar>");
      expect(tblPr).not.toContain("<w:tblBorders>");
      expect(tableRows(xml)[1]).not.toContain("<w:cantSplit/>");
    }
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

  it("exports tableRef as the live Table N label", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "tableRef",
              attrs: {
                section: "elr_monitoring",
                targetField: "table",
                tableIndex: 0,
                n: 2,
              },
            },
            { type: "text", text: "." },
          ],
        },
      ],
    });
    expect(xml).toContain("Table 2");
    expect(xml).not.toContain("tableRef");
  });

  it("exports a bold tableRef as a bold Table N run", () => {
    const xml = narrativeToDocxXml({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "tableRef",
              attrs: {
                section: "elr_monitoring",
                targetField: "table",
                tableIndex: 0,
                n: 9,
              },
              marks: [{ type: "bold" }],
            },
            { type: "text", text: "." },
          ],
        },
      ],
    });
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("Table 9");
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

  it("flattens quantity mathInline to escaped Unicode so Word can open <1 CFU/plate", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "settle plates " },
            {
              type: "mathInline",
              attrs: {
                mathml: "",
                latex: String.raw`<1\text{ CFU/plate}`,
                omml: '<m:oMath><m:r><m:t xml:space="preserve"><1 CFU/plate</m:t></m:r></m:oMath>',
                ommlDirty: false,
              },
            },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain("&lt;1 CFU/plate");
    expect(xml).not.toContain("<m:oMath");
    expect(xml).not.toMatch(/<m:t[^>]*><1/);
  });

  it("never drops leftover math that cannot convert to OMML", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "March 2027 (" },
            {
              type: "mathInline",
              attrs: {
                mathml: "",
                latex: String.raw`\pm 30`,
                omml: null,
                ommlDirty: true,
              },
            },
            { type: "text", text: " days)" },
          ],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain("± 30");
    expect(xml).toContain("March 2027");
    expect(xml).toContain("days)");
  });
});

describe("narrativeToDocxXml citation markers", () => {
  it("renders matching numeric markers as bare superscript numbers", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Verify REQ-101 meets the specification [1].",
            },
          ],
        },
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 3]" }],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain(">1</w:t>");
    expect(xml).not.toContain("[1]");
    expect(xml).toContain("Citations:");
    expect(xml).toContain("1. [protocol.pdf, p. 3]");
  });

  it("leaves unrelated numeric brackets alone", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "See SOP [12] and result [1]." }],
        },
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Citations:" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "1. [protocol.pdf, p. 3]" }],
        },
      ],
    };

    const xml = narrativeToDocxXml(doc);
    expect(xml).toContain("See SOP [12] and result ");
    expect(xml).toContain("[12]");
    expect(xml).not.toContain("[1]");
  });
});
