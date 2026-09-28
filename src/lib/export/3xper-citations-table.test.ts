import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  THREE_XPER_CITATION_HEADERS,
  THREE_XPER_CITATIONS_HEADING,
  qsrDocumentReferenceCatalog,
  threeXperCitationRows,
  threeXperCitationsAppendixXml,
} from "@/lib/export/3xper-citations-table";
import type { ReportSectionRecord } from "@/types/report";

function paragraph(text?: string): JSONContent {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function cell(
  kind: "tableHeader" | "tableCell",
  text: string,
  attrs: { colspan?: number } = {}
): JSONContent {
  return {
    type: kind,
    attrs: { colspan: attrs.colspan ?? 1, rowspan: 1, colwidth: null },
    content: [text ? paragraph(text) : paragraph()],
  };
}

function tableDoc(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: headers.map((h) => cell("tableHeader", h)),
          },
          ...rows.map((row) => ({
            type: "tableRow" as const,
            content: headers.map((_, i) => cell("tableCell", row[i] ?? "")),
          })),
        ],
      },
    ],
  };
}

function section(
  key: string,
  content: unknown
): ReportSectionRecord {
  return {
    id: `sec-${key}`,
    reportId: "qsr-1",
    section: key as ReportSectionRecord["section"],
    content,
    updatedAt: "2026-04-08T00:00:00.000Z",
  };
}

describe("threeXperCitationRows", () => {
  it("splits filename, description, and Page # from a parked source", () => {
    expect(
      threeXperCitationRows([
        { number: 1, source: "[User Requirement Specification.PDF, p. 1]" },
        { number: 2, source: "[Design Qualification.PDF, p. 5]" },
      ])
    ).toEqual([
      {
        citationNumber: "1",
        documentReference: "",
        description: "User Requirement Specification",
        referencePage: "Page # 1",
      },
      {
        citationNumber: "2",
        documentReference: "",
        description: "Design Qualification",
        referencePage: "Page # 5",
      },
    ]);
  });

  it("keeps written page lists and ranges", () => {
    expect(
      threeXperCitationRows([
        { number: 1, source: "[iq.pdf, p. 1-3]" },
        { number: 2, source: "[oq.pdf, p. 4, 26]" },
        { number: 3, source: "[audit.pdf]" },
      ]).map((row) => row.referencePage)
    ).toEqual(["Page # 1-3", "Page # 4, 26", ""]);
  });

  it("fills Document reference # from QSR qualification documents", () => {
    const sections = [
      section("qsr_qualification_documents", {
        table: tableDoc(
          [
            "Document Name",
            "Document Number",
            "Revision",
            "Status",
            "Effective Date / Approved date",
            "Remarks",
          ],
          [
            [
              "User Requirement Specification",
              "URS/PB2/001/12345",
              "00",
              "Approved",
              "01-01-2026",
              "",
            ],
            ["Design Qualification", "DQ/PB2/014/88", "", "", "", ""],
          ]
        ),
      }),
    ];
    const rows = threeXperCitationRows(
      [
        { number: 1, source: "[User Requirement Specification.PDF, p. 1]" },
        { number: 2, source: "[Design Qualification.PDF, p. 1]" },
      ],
      sections
    );
    expect(rows.map((row) => row.documentReference)).toEqual([
      "URS/PB2/001/12345",
      "DQ/PB2/014/88",
    ]);
  });

  it("carries a blank protocol name onto the report-number row", () => {
    const sections = [
      section("qsr_qualification_documents", {
        table: tableDoc(
          ["Document Name", "Document Number", "Revision", "Status", "Date", "Remarks"],
          [
            ["Installation Qualification", "", "01", "", "", "Protocol"],
            ["", "IQ/PB2/003/9", "", "Approved", "02-02-2026", ""],
          ]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[Installation Qualification.PDF, p. 4]" }],
      sections
    );
    expect(row?.documentReference).toBe("IQ/PB2/003/9");
  });

  it("matches URS family names onto Table 3 and References", () => {
    const sections = [
      section("qsr_references", {
        table: tableDoc(
          ["Name of the Document", "Reference Number"],
          [["User Requirement Specification", "URS/PB2/XX/0001"]]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[URS.pdf, p. 2]" }],
      sections
    );
    expect(row?.documentReference).toBe("URS/PB2/XX/0001");
    expect(row?.description).toBe("URS");
  });

  it("uses an id-shaped filename as the document reference", () => {
    const [row] = threeXperCitationRows([
      { number: 1, source: "[URS/PB2/001/55.pdf, p. 3]" },
    ]);
    expect(row?.documentReference).toBe("URS/PB2/001/55");
    expect(row?.description).toBe("User Requirement Specification");
  });

  it("reads SOP numbers from section 4", () => {
    const sections = [
      section("qsr_sops", {
        table: tableDoc(
          ["SOP Name", "SOP Number", "Effective Date"],
          [["Training", "SOP/QA/014", "01-03-2026"]]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[Training.pdf, p. 1]" }],
      sections
    );
    expect(row?.documentReference).toBe("SOP/QA/014");
  });
});

describe("qsrDocumentReferenceCatalog", () => {
  it("skips header rows, banners, and empty numbers", () => {
    const catalog = qsrDocumentReferenceCatalog([
      section("qsr_qualification_documents", {
        table: {
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    cell("tableHeader", "Document Name"),
                    cell("tableHeader", "Document Number"),
                  ],
                },
                {
                  type: "tableRow",
                  content: [cell("tableCell", "GLR-1301", { colspan: 2 })],
                },
                {
                  type: "tableRow",
                  content: [
                    cell("tableCell", "User Requirement Specification"),
                    cell("tableCell", ""),
                  ],
                },
                {
                  type: "tableRow",
                  content: [
                    cell("tableCell", "Design Qualification"),
                    cell("tableCell", "DQ/PB2/1"),
                  ],
                },
              ],
            },
          ],
        },
      }),
    ]);
    expect(catalog).toEqual([
      { name: "Design Qualification", number: "DQ/PB2/1" },
    ]);
  });
});

describe("threeXperCitationsAppendixXml", () => {
  it("is empty when nothing was cited", () => {
    expect(threeXperCitationsAppendixXml([])).toBe("");
  });

  it("renders a CITATIONS heading and the four-column table", () => {
    const xml = threeXperCitationsAppendixXml(
      [
        { number: 1, source: "[User Requirement Specification.PDF, p. 1]" },
        { number: 2, source: "[Design Qualification.PDF, p. 1]" },
      ],
      { variant: "qsr" }
    );
    expect(xml).toContain(THREE_XPER_CITATIONS_HEADING);
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain("<w:tbl>");
    expect(xml).toContain('<w:gridCol w:w="1400"/>');
    expect(xml).toContain('<w:gridCol w:w="3800"/>');
    for (const header of THREE_XPER_CITATION_HEADERS) {
      expect(xml).toContain(header);
    }
    expect(xml).toContain("User Requirement Specification");
    expect(xml).toContain("Page # 1");
    expect(xml).toContain("Design Qualification");
    expect(xml).toContain('w:fill="FFD966"');
    expect(xml).not.toContain("1. [User Requirement Specification.PDF, p. 1]");
  });

  it("uses grey header fill on vendor qualification", () => {
    const xml = threeXperCitationsAppendixXml(
      [{ number: 1, source: "[audit.pdf, p. 3]" }],
      { variant: "vq" }
    );
    expect(xml).toContain('w:fill="D9D9D9"');
    expect(xml).not.toContain('w:fill="FFD966"');
  });
});
