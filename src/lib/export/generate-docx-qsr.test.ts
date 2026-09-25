import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import {
  EMPTY_QSR_CONTENT,
  QSR_OPERATING_RANGE_HEADERS,
  QSR_QUALIFICATION_DOCUMENT_HEADERS,
  QSR_RTM_HEADERS,
  QSR_SECTION_KEYS,
  shapeOperatingRangeTable,
  type QsrSectionContent,
  type QsrSectionKey,
} from "@/lib/document-types/qsr/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "3xper-qualification-summary-report-template.docx"
);

function qsrReport(): typeof reports.$inferSelect {
  return {
    id: "qsr-1",
    documentType: "qualification_summary_report",
    documentNo: "QSR/GLR-1301",
    date: new Date("2026-04-08"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {
      equipmentName: "Glass Lined Reactor",
      equipmentCode: "GLR-1301",
      capacity: "3.0 KL",
      plantSection: "Production",
      revision: "01",
      revisionDescription: "Periodic review",
    },
    status: "draft",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function sectionsWith(
  overrides: Partial<Record<QsrSectionKey, QsrSectionContent>> = {}
): ReportSectionRecord[] {
  return QSR_SECTION_KEYS.map((key) => ({
    id: key,
    reportId: "qsr-1",
    section: key,
    content: (overrides[key] ?? EMPTY_QSR_CONTENT[key]) as ReportSectionRecord["content"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

function text(value: string, bold = false): JSONContent {
  return bold
    ? { type: "text", text: value, marks: [{ type: "bold" }] }
    : { type: "text", text: value };
}

function cell(kind: "tableHeader" | "tableCell", value: string, bold = false): JSONContent {
  return {
    type: kind,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [value ? { type: "paragraph", content: [text(value, bold)] } : { type: "paragraph" }],
  };
}

function tableDoc(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | { bold: string }>>
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          { type: "tableRow", content: headers.map((h) => cell("tableHeader", h)) },
          ...rows.map((row) => ({
            type: "tableRow",
            content: headers.map((_, i) => {
              const value = row[i] ?? "";
              return typeof value === "string"
                ? cell("tableCell", value)
                : cell("tableCell", value.bold, true);
            }),
          })),
        ],
      },
    ],
  };
}

async function exportXml(sections: ReportSectionRecord[]) {
  const zip = new PizZip(await generateReportDocx({ report: qsrReport(), sections }));
  const read = (name: string) => zip.file(name)?.asText() ?? "";
  return { document: read("word/document.xml"), header: read("word/header1.xml") };
}

function visibleText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
}

/** The `<w:tr>` whose text contains `needle`. */
function rowContaining(xml: string, needle: string): string {
  const rows = xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
  const row = rows.find((r) => visibleText(r).includes(needle));
  if (!row) throw new Error(`no row containing ${needle}`);
  return row;
}

describe("qualification summary report DOCX export", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "3xper";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "3xper";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("has a template on disk", () => {
    expect(fs.existsSync(TEMPLATE)).toBe(true);
  });

  it("fills identity fields and replaces every slot on a blank report", async () => {
    const { document, header } = await exportXml(sectionsWith());
    const body = visibleText(document);

    expect(body).not.toContain("[[");
    expect(body).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(body).toContain("GLR-1301");
    expect(body).toContain("Operating Range (GLR-1301)");
    expect(body).toContain("Periodic review");
    expect(visibleText(header)).toContain("QSR/GLR-1301");
    expect(visibleText(header)).toContain("Revision: 01");

    const starts = [...document.matchAll(/<w:bookmarkStart w:id="(\d+)" w:name="([^"]+)"/g)];
    const ends = [...document.matchAll(/<w:bookmarkEnd w:id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(starts.map((m) => m[1])).size).toBe(starts.length);
    expect(ends.toSorted()).toEqual(starts.map((m) => m[1]).toSorted());
    expect(document).not.toMatch(/PAGEREF /);

    const indexTable = (document.match(/<w:tbl[ >][\s\S]*?<\/w:tbl>/g) ?? []).find(
      (tbl) => visibleText(tbl).includes("Sr. No.") && visibleText(tbl).includes("Page No")
    );
    expect(indexTable, "Index table").toBeTruthy();
    const indexRows = indexTable!.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? [];
    const firstEntry = indexRows[1] ?? "";
    expect(visibleText(firstEntry)).toMatch(/5/);

    expect(body).not.toContain("Site Acceptance Test Checklist");
    expect(rowContaining(document, "ANY SPECIFIC REQUIREMENTS")).toContain(
      '<w:gridSpan w:val="6"/>'
    );
    expect(rowContaining(document, "OTHER AUXILIARY REQUIREMENT")).toContain(
      '<w:gridSpan w:val="6"/>'
    );
    expect(document).not.toContain("PRIMARY CONDENSER");
    expect(document).not.toContain("MOTOR & GEARBOX");
  });

  it("keeps user text that looks like a template tag literal", async () => {
    const { document } = await exportXml(
      sectionsWith({
        qsr_objective: {
          narrative: {
            type: "doc",
            content: [{ type: "paragraph", content: [text("Set {equipmentCode} & <limits>")] }],
          },
        },
      })
    );
    expect(document).toContain("Set {equipmentCode} &amp; &lt;limits&gt;");
  });

  it("rebuilds banner rows and protocol/report continuation merges", async () => {
    const { document } = await exportXml(
      sectionsWith({
        qsr_qualification_documents: {
          table: tableDoc(QSR_QUALIFICATION_DOCUMENT_HEADERS, [
            [{ bold: "VES-1308" }],
            ["Design Qualification", "DQP/VES-1308", "00", "Approved", "01/01/2026", "NA"],
            ["", "DQR/VES-1308", "00", "Approved", "02/01/2026", "NA"],
          ]),
        },
      })
    );

    const banner = (document.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).find(
      (r) => visibleText(r) === "VES-1308"
    );
    expect(banner).toContain('<w:gridSpan w:val="6"/>');

    const report = rowContaining(document, "DQR/VES-1308");
    const firstCell = report.match(/<w:tc>[\s\S]*?<\/w:tc>/)?.[0] ?? "";
    expect(firstCell).toMatch(/<w:vMerge\/>|<w:vMerge w:val="continue"\/>/);
    const protocol = rowContaining(document, "DQP/VES-1308");
    expect(protocol).toContain('<w:vMerge w:val="restart"/>');
  });

  it("exports a seeded RTM banner as a merged group row", async () => {
    const seeded = (EMPTY_QSR_CONTENT.qsr_rtm_process as { table: JSONContent })
      .table;
    const { document } = await exportXml(
      sectionsWith({
        qsr_rtm_process: { table: seeded },
      })
    );
    const banner = (document.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).find(
      (r) => visibleText(r) === "ANY SPECIFIC REQUIREMENTS"
    );
    expect(banner).toContain('<w:gridSpan w:val="6"/>');
  });

  it("spans Details across a blank Range cell on the operating range table", async () => {
    const { document } = await exportXml(
      sectionsWith({
        qsr_operating_range: {
          table: tableDoc(QSR_OPERATING_RANGE_HEADERS, [
            ["1.", "Pressure", "", "-1.0 to 3.0 kg/cm²"],
            ["2.", "Temperature", "Minimum", "-20 °C"],
            ["", "", "Maximum", "150 °C"],
          ]),
        },
      })
    );
    expect(rowContaining(document, "Pressure")).toContain('<w:gridSpan w:val="2"/>');
    expect(rowContaining(document, "Minimum")).not.toContain("<w:gridSpan");
    expect(rowContaining(document, "Maximum")).toMatch(/<w:vMerge\/>/);
  });

  it("falls back to the generic converter for lists inside a narrative", async () => {
    const { document } = await exportXml(
      sectionsWith({
        qsr_conclusion: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [text("IQ completed")] }],
                  },
                ],
              },
            ],
          },
        },
        qsr_rtm_process: {
          table: tableDoc(QSR_RTM_HEADERS, [["URS-1", "Capacity", "3.0 KL", "IQ", "8.1", "Complies"]]),
        },
      })
    );
    const listParagraph = (document.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).find(
      (p) => visibleText(p) === "IQ completed"
    );
    expect(listParagraph).toContain("<w:numPr>");
    expect(visibleText(rowContaining(document, "URS-1"))).toBe("URS-1Capacity3.0 KLIQ8.1Complies");
  });

  it("shows the operating range table as the form, without a Range header", () => {
    const shaped = shapeOperatingRangeTable(
      tableDoc(QSR_OPERATING_RANGE_HEADERS, [
        ["1.", "Pressure", "", ""],
        ["4.", "Temperature", "Minimum", "-20 °C"],
        ["", "", "Maximum", "150 °C"],
      ])
    );
    const table = shaped.content?.[0];
    const label = (cell: JSONContent | undefined) =>
      (cell?.content ?? [])
        .flatMap((paragraph) => paragraph.content ?? [])
        .map((node) => node.text ?? "")
        .join("");
    expect((table?.content?.[0]?.content ?? []).map(label)).toEqual([
      "S.No",
      "Parameter",
      "Details",
    ]);
    const pressure = table?.content?.[1];
    expect(pressure?.content).toHaveLength(3);
    expect(pressure?.content?.[2]?.attrs?.colspan).toBe(2);
    const temperature = table?.content?.[2];
    expect(temperature?.content?.[0]?.attrs?.rowspan).toBe(2);
    expect(temperature?.content?.[1]?.attrs?.rowspan).toBe(2);
    expect(table?.content?.[3]?.content).toHaveLength(2);
  });

  it("unifies citations at the end of the form", async () => {
    function cited(body: string, source: string): JSONContent {
      return {
        type: "doc",
        content: [
          { type: "paragraph", content: [text(body)] },
          { type: "paragraph" },
          { type: "paragraph", content: [text("Citations:")] },
          { type: "paragraph", content: [text(`1. ${source}`)] },
        ],
      };
    }
    const { document } = await exportXml(
      sectionsWith({
        qsr_conclusion: { narrative: cited("The system is qualified [1].", "[iq.pdf, p. 4]") },
        qsr_objective: { narrative: cited("The URS was approved [1].", "[urs.pdf, p. 2]") },
      })
    );
    const body = visibleText(document);
    const citationsAt = body.indexOf("CITATIONS");
    expect(citationsAt).toBeGreaterThan(body.indexOf("CONCLUSION:"));
    expect(body).toContain("The URS was approved");
    expect(body).toContain("The system is qualified");
    expect(document).toContain('<w:vertAlign w:val="superscript"/>');
    expect(body).not.toContain("Citations:");
    expect(body).toContain("1. [urs.pdf, p. 2]");
    expect(body).toContain("2. [iq.pdf, p. 4]");
    expect(body.indexOf("1. [urs.pdf, p. 2]")).toBeGreaterThan(citationsAt);
  });
});
