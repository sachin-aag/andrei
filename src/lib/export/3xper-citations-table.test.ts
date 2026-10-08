import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  THREE_XPER_CITATION_HEADERS,
  THREE_XPER_CITATIONS_HEADING,
  qsrDocumentReferenceCatalog,
  threeXperCitationIdentityKey,
  threeXperCitationRows,
  threeXperCitationsAppendixXml,
} from "@/lib/export/3xper-citations-table";
import { unifyReportCitationsForExport } from "@/lib/export/elr-unified-citations";
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
        documentReference: "User Requirement Specification",
        description: "User Requirement Specification",
        referencePage: "Page # 1",
      },
      {
        citationNumber: "2",
        documentReference: "Design Qualification",
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

  it("puts equipment ids only in Document reference #", () => {
    expect(
      threeXperCitationRows([
        { number: 18, source: "[ANFD-1302, p. 3]" },
        { number: 19, source: "[SSR-1303.pdf, p. 4]" },
        { number: 20, source: "[ANFD-1302, p. 3, 4]" },
      ])
    ).toEqual([
      {
        citationNumber: "18",
        documentReference: "ANFD-1302",
        description: "",
        referencePage: "Page # 3",
      },
      {
        citationNumber: "19",
        documentReference: "SSR-1303",
        description: "",
        referencePage: "Page # 4",
      },
      {
        citationNumber: "20",
        documentReference: "ANFD-1302",
        description: "",
        referencePage: "Page # 3, 4",
      },
    ]);
  });

  it("splits a protocol number out of a titled filename", () => {
    const rows = threeXperCitationRows([
      {
        number: 22,
        source:
          "[1 CVPR-ISM4-26-001-00 ISM Stage-4 Cleaning Verification Protocol, p. 22]",
      },
      {
        number: 25,
        source: "[Isosorbide Mononitrate (Oral and Injection) PDE, p. 1]",
      },
      {
        number: 3,
        source:
          "[CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol, p. 1]",
      },
    ]);
    expect(rows).toEqual([
      {
        citationNumber: "22",
        documentReference: "CVPR-ISM4-26-001-00",
        description: "ISM Stage-4 Cleaning Verification Protocol",
        referencePage: "Page # 22",
      },
      {
        citationNumber: "25",
        documentReference: "Isosorbide Mononitrate (Oral and Injection) PDE",
        description: "Isosorbide Mononitrate (Oral and Injection) PDE",
        referencePage: "Page # 1",
      },
      {
        citationNumber: "3",
        documentReference: "CVRP-ISM4-26-001-00",
        description: "ISM Stage-4 Cleaning Verification Protocol",
        referencePage: "Page # 1",
      },
    ]);
  });

  it("fills Description from CVP abbreviations when the cite is only an equipment id", () => {
    const sections = [
      section("cvp_abbreviations", {
        table: tableDoc(
          ["Abbreviation", "Description"],
          [
            ["ANFD", "Agitated Nutsche Filter cum Drier"],
            ["SSR", "Stainless Steel Reactor"],
          ]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[ANFD-1302, p. 3]" }],
      sections
    );
    expect(row?.documentReference).toBe("ANFD-1302");
    expect(row?.description).toBe("Agitated Nutsche Filter cum Drier");
  });

  it("uses CVP equipment-table names, not the S. No. column", () => {
    const sections = [
      section("cvp_scope", {
        table: tableDoc(
          [
            "S. No.",
            "Name of the Equipment",
            "Equipment No.",
            "Capacity",
            "MOC",
            "Purpose",
            "Product contact / Non-product contact",
          ],
          [["1", "Agitated Nutsche Filter Dryer", "ANFD-1302", "2 KL", "", "", ""]]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[ANFD-1302, p. 3]" }],
      sections
    );
    expect(row?.documentReference).toBe("ANFD-1302");
    expect(row?.description).toBe("Agitated Nutsche Filter Dryer");
  });

  it("reads CVP annexure Document Number, not the list serial", () => {
    const sections = [
      section("cvp_annexures", {
        table: tableDoc(
          ["S. No.", "Document Title", "Document Number"],
          [
            [
              "1",
              "ISM Stage-4 Cleaning Verification Protocol",
              "CVPR-ISM4-26-001-00",
            ],
            ["2", "PDE report", "PDE-ISM-26-001"],
          ]
        ),
      }),
    ];
    const catalog = qsrDocumentReferenceCatalog(sections);
    expect(catalog).toEqual([
      {
        name: "ISM Stage-4 Cleaning Verification Protocol",
        number: "CVPR-ISM4-26-001-00",
      },
      { name: "PDE report", number: "PDE-ISM-26-001" },
    ]);
    const [row] = threeXperCitationRows(
      [
        {
          number: 1,
          source:
            "[1 CVPR-ISM4-26-001-00 ISM Stage-4 Cleaning Verification Protocol, p. 21]",
        },
      ],
      sections
    );
    expect(row?.documentReference).toBe("CVPR-ISM4-26-001-00");
    expect(row?.description).toBe("ISM Stage-4 Cleaning Verification Protocol");
  });

  it("does not treat NA equipment numbers as a document reference", () => {
    const sections = [
      section("cvp_scope", {
        table: tableDoc(
          [
            "S. No.",
            "Name of the Equipment",
            "Equipment No.",
            "Capacity",
            "MOC",
            "Purpose",
            "Product contact / Non-product contact",
          ],
          [["8", "Process lines", "NA", "", "", "Transfer", ""]]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[Process lines surface area, p. 1]" }],
      sections
    );
    expect(row?.documentReference).toBe("Process lines surface area");
    expect(row?.description).toBe("Process lines surface area");
  });

  it("never leaves Document reference # blank", () => {
    const rows = threeXperCitationRows([
      { number: 1, source: "[data sheet, p. 2]" },
      { number: 2, source: "[ISM3 CV data sheet, p. 1]" },
      { number: 3, source: "[Isosorbide Mononitrate (Oral and Injection) PDE, p. 1]" },
      { number: 4, source: "[Process lines surface area, p. 1]" },
      { number: 5, source: "[audit.pdf]" },
    ]);
    expect(rows.map((row) => row.documentReference)).toEqual([
      "data sheet",
      "ISM3 CV data sheet",
      "Isosorbide Mononitrate (Oral and Injection) PDE",
      "Process lines surface area",
      "audit",
    ]);
  });

  it("reads Document # from CVP 15.N.2 supporting-documents tables", () => {
    const sections = [
      section("cvp_equipment_sampling", {
        items: [
          tableDoc(
            ["Documents", "Document #", "Effective / Approval date"],
            [["Specification", "SPEC-ISM3-26-001", "08-Apr-2026"]]
          ),
        ],
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[Specification, p. 1]" }],
      sections
    );
    expect(row?.documentReference).toBe("SPEC-ISM3-26-001");
    expect(row?.description).toBe("Specification");
  });

  it("fills a short data-sheet cite from the longer related-document title", () => {
    const sections = [
      section("cvp_related_documents", {
        table: tableDoc(
          ["S. No.", "Document Title", "Document Number"],
          [["1", "ISM3 CV data sheet", "DS-ISM3-26-001"]]
        ),
      }),
    ];
    const [row] = threeXperCitationRows(
      [{ number: 1, source: "[data sheet, p. 2]" }],
      sections
    );
    expect(row?.documentReference).toBe("DS-ISM3-26-001");
    expect(row?.description).toBe("ISM3 CV data sheet");
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

describe("threeXperCitationIdentityKey", () => {
  const catalogSections = [
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
        ]
      ),
    }),
  ];

  it("treats catalog aliases of the same file and page as one cite", () => {
    expect(
      threeXperCitationIdentityKey(
        "[User Requirement Specification.PDF, p. 2]",
        catalogSections
      )
    ).toBe(threeXperCitationIdentityKey("[URS.pdf, p.2]", catalogSections));
  });

  it("keeps different pages of the same catalog document distinct", () => {
    expect(
      threeXperCitationIdentityKey(
        "[User Requirement Specification.PDF, p. 2]",
        catalogSections
      )
    ).not.toBe(
      threeXperCitationIdentityKey(
        "[User Requirement Specification.PDF, p. 3]",
        catalogSections
      )
    );
  });
});

describe("unifyReportCitationsForExport with 3xper identity", () => {
  it("collapses catalog aliases onto one bibliography row and shared [n]", () => {
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
          ]
        ),
      }),
      section("qsr_objective", {
        narrative: {
          type: "doc",
          content: [
            paragraph("The URS was approved [1]."),
            paragraph(),
            paragraph("Citations:"),
            paragraph("1. [User Requirement Specification.PDF, p. 2]"),
          ],
        },
      }),
      section("qsr_scope", {
        narrative: {
          type: "doc",
          content: [
            paragraph("Capacity matches the URS [1]."),
            paragraph(),
            paragraph("Citations:"),
            paragraph("1. [URS.pdf, p.2]"),
          ],
        },
      }),
    ];
    const { bibliography, sections: next } = unifyReportCitationsForExport(
      sections,
      ["qsr_qualification_documents", "qsr_objective", "qsr_scope"],
      {
        sourceIdentity: (source) =>
          threeXperCitationIdentityKey(source, sections),
      }
    );
    expect(bibliography).toEqual([
      { number: 1, source: "[User Requirement Specification.PDF, p. 2]" },
    ]);
    const byKey = Object.fromEntries(next.map((row) => [row.section, row]));
    const textOf = (doc: JSONContent) =>
      (doc.content ?? [])
        .map((node) =>
          (node.content ?? [])
            .map((child) => (child as { text?: string }).text ?? "")
            .join("")
        )
        .join("\n");
    expect(
      textOf(
        (byKey.qsr_objective?.content as { narrative: JSONContent }).narrative
      )
    ).toBe("The URS was approved [1].");
    expect(
      textOf((byKey.qsr_scope?.content as { narrative: JSONContent }).narrative)
    ).toBe("Capacity matches the URS [1].");
  });

  it("keeps each cited page of a protocol as its own bibliography row", () => {
    const sections = [
      section("cvp_related_documents", {
        table: tableDoc(
          ["S. No.", "Document Title", "Document Number"],
          [["1", "ISM3 CV data sheet", "DS-ISM3-26-001"]]
        ),
      }),
      section("cvp_objective", {
        narrative: {
          type: "doc",
          content: [
            paragraph("Sampling follows the cited protocol [1]."),
            paragraph(),
            paragraph("Citations:"),
            paragraph(
              "1. [CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol, p. 1]"
            ),
          ],
        },
      }),
      section("cvp_scope", {
        narrative: {
          type: "doc",
          content: [
            paragraph("Equipment list matches the protocol [1]."),
            paragraph(),
            paragraph("Citations:"),
            paragraph(
              "1. [CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol, p. 3]"
            ),
          ],
        },
      }),
      section("cvp_background", {
        narrative: {
          type: "doc",
          content: [
            paragraph("The data sheet confirms the train [1]."),
            paragraph(),
            paragraph("Citations:"),
            paragraph("1. [ISM3 CV data sheet, p. 1]"),
          ],
        },
      }),
      section("cvp_prerequisites", {
        narrative: {
          type: "doc",
          content: [
            paragraph("Pre-requisites reuse the sheet [1]."),
            paragraph(),
            paragraph("Citations:"),
            paragraph("1. [data sheet, p. 2]"),
          ],
        },
      }),
    ];
    const { bibliography, sections: next } = unifyReportCitationsForExport(
      sections,
      [
        "cvp_related_documents",
        "cvp_objective",
        "cvp_scope",
        "cvp_background",
        "cvp_prerequisites",
      ],
      {
        sourceIdentity: (source) =>
          threeXperCitationIdentityKey(source, sections),
      }
    );
    expect(bibliography).toEqual([
      {
        number: 1,
        source:
          "[CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol, p. 1]",
      },
      {
        number: 2,
        source:
          "[CVRP-ISM4-26-001-00 ISM Stage-4 Cleaning Verification_Protocol, p. 3]",
      },
      { number: 3, source: "[ISM3 CV data sheet, p. 1]" },
      { number: 4, source: "[data sheet, p. 2]" },
    ]);
    const rows = threeXperCitationRows(bibliography, sections);
    expect(rows).toEqual([
      {
        citationNumber: "1",
        documentReference: "CVRP-ISM4-26-001-00",
        description: "ISM Stage-4 Cleaning Verification Protocol",
        referencePage: "Page # 1",
      },
      {
        citationNumber: "2",
        documentReference: "CVRP-ISM4-26-001-00",
        description: "ISM Stage-4 Cleaning Verification Protocol",
        referencePage: "Page # 3",
      },
      {
        citationNumber: "3",
        documentReference: "DS-ISM3-26-001",
        description: "ISM3 CV data sheet",
        referencePage: "Page # 1",
      },
      {
        citationNumber: "4",
        documentReference: "DS-ISM3-26-001",
        description: "ISM3 CV data sheet",
        referencePage: "Page # 2",
      },
    ]);
    const byKey = Object.fromEntries(next.map((row) => [row.section, row]));
    const textOf = (doc: JSONContent) =>
      (doc.content ?? [])
        .map((node) =>
          (node.content ?? [])
            .map((child) => (child as { text?: string }).text ?? "")
            .join("")
        )
        .join("\n");
    expect(
      textOf(
        (byKey.cvp_background?.content as { narrative: JSONContent }).narrative
      )
    ).toBe("The data sheet confirms the train [3].");
    expect(
      textOf(
        (byKey.cvp_prerequisites?.content as { narrative: JSONContent })
          .narrative
      )
    ).toBe("Pre-requisites reuse the sheet [4].");
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
    expect(xml).toContain('<w:gridCol w:w="1200"/>');
    expect(xml).toContain('<w:gridCol w:w="4200"/>');
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

  it("keeps CITATIONS out of Heading1 on the cleaning verification protocol", () => {
    const xml = threeXperCitationsAppendixXml(
      [{ number: 1, source: "[protocol.pdf, p. 3]" }],
      { variant: "cvp" }
    );
    expect(xml).toContain('<w:pStyle w:val="BodyText"/>');
    expect(xml).not.toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).toContain('w:fill="D9D9D9"');
  });
});
