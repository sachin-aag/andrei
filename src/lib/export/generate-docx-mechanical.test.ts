import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { reportExportDocxFileName } from "@/lib/export/docx-filename";
import { generateReportDocx } from "@/lib/export/generate-docx";
import { docxParagraphPlainText } from "@/lib/export/docx-toc-headings";
import {
  EMPTY_MECHANICAL_DV_CONTENT,
  MECHANICAL_DV_SECTION_KEYS,
  MECHANICAL_RESULTS_HEADERS,
  MECHANICAL_UUT_HEADERS,
} from "@/lib/document-types/mechanical/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "convergent-mechanical-dv-report-template.docx"
);

function narrativeDoc(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function tableDoc(rows: readonly (readonly string[])[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: rows.map((cells, rowIndex) => ({
          type: "tableRow",
          content: cells.map((text) => ({
            type: rowIndex === 0 ? "tableHeader" : "tableCell",
            content: [
              {
                type: "paragraph",
                content: text ? [{ type: "text", text }] : [],
              },
            ],
          })),
        })),
      },
    ],
  };
}

function mechanicalReport(): typeof reports.$inferSelect {
  return {
    id: "mech-export-1",
    documentType: "mechanical_design_verification",
    documentNo: "825-00101",
    date: new Date("2024-10-31"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {
      revision: "A",
      productName: "Solea Model 3 Perioguide",
      projectName: "Solea Model 3 Perioguide",
      projectLeader: "Charles Kerbage",
      dhfIndexNo: "825-00003",
      ecoDcoNo: "DCO-02058",
      templateNo: "731-00008 Rev. B",
    },
    status: "draft",
    createdAt: new Date("2024-09-05"),
    updatedAt: new Date("2024-10-31"),
  };
}

const CONTENT: Record<string, unknown> = {
  purpose: narrativeDoc(
    "The purpose of this report is to present the testing results obtained following the partial executions of the Solea Model 3 System Design Verification Protocol and Solea Model 3 Hardware Design Verification Protocol, respectively."
  ),
  scope: narrativeDoc(
    "This test report applies to Solea Model 3 and summarizes verification activities for system configurations defined as TOP-00017 and TOP-00051."
  ),
  testers_dates: narrativeDoc(
    "All testing was performed by Convergent Dental Senior Test Engineer Wesley Harrington and Convergent Dental Test Engineer Dylan Burke between the dates of 05 September 2024 and 31 October 2024."
  ),
  executed_protocol: narrativeDoc(
    "Partial executions of 825-00024, Rev. G and 825-00025, Rev. F, respectively."
  ),
  protocol_deviations: narrativeDoc(
    "Throughout the execution of the test protocol, the test engineers implemented five (5) deviations to the protocol method."
  ),
  units_under_test: narrativeDoc(
    "Six (6) Solea systems made up a total of eight (8) unique UUT's."
  ),
  equipment_and_calibration: narrativeDoc(
    "The table below lists all equipment used for testing during the partial executions of the test protocols."
  ),
  failure_forms: narrativeDoc(
    "There was one (1) failure encountered throughout the partial execution of the test protocol, 825-00024 Rev. G."
  ),
  data_collection_forms: narrativeDoc(
    "All completed data collection forms are attached in Appendix A of this report."
  ),
  requirements_verified: narrativeDoc(
    "All requirements detailed in the Solea M3 Perioguide System & Hardware Test Plan (825-00104 Rev. B) were verified."
  ),
  observations: narrativeDoc(
    "Prior to the start of testing, it was determined that the Perioguide Feature on TOP-00017 systems with an LCD-2 laser controller was not applicable."
  ),
  problems_resolution: narrativeDoc(
    "There was one (1) reported failure, captured in Failure/Out of Specification Form No. 1. No immediate action was required."
  ),
  conclusion: narrativeDoc(
    "The Solea Model 3 Perioguide Feature has been deemed acceptable for release on the Solea Model 3."
  ),
};

function mechanicalSections(): ReportSectionRecord[] {
  return MECHANICAL_DV_SECTION_KEYS.map((section, i) => {
    const base = EMPTY_MECHANICAL_DV_CONTENT[section] as Record<
      string,
      unknown
    >;
    let content: Record<string, unknown> = { ...base };

    if (section === "testers_dates") {
      content = { testers: CONTENT.testers_dates };
    } else if (section === "requirements_verified") {
      content = {
        narrative: CONTENT.requirements_verified,
        hardwareTable: tableDoc([
          [...MECHANICAL_RESULTS_HEADERS],
          [
            "M3-HRS-GN-001",
            "All Components shall be RoHS compliant.",
            "Refer to Solea RoHS Compliance Statement, 726-00003 Rev. A.",
            "Pass",
          ],
        ]),
        systemTable: tableDoc([
          [...MECHANICAL_RESULTS_HEADERS],
          [
            "M3-SYS-SW-007",
            "The system shall allow for remote access through a 802.11 wireless communication network.",
            "See data sheets in Appendix A. Refer to Failure/Out of Specification Form No. 1",
            "Fail**",
          ],
        ]),
      };
    } else if (section === "revision_history") {
      content = {
        table: tableDoc([
          [
            "Revision Level",
            "Revision Date",
            "DCO/ECO Number",
            "Description of Revision",
            "Revision Author",
          ],
          [
            "A",
            "31-Oct-2024",
            "DCO-02058",
            "Initial release to summarize verification activities.",
            "W. Harrington / D. Burke",
          ],
        ]),
      };
    } else if (CONTENT[section]) {
      content = { ...base, narrative: CONTENT[section] };
    }

    return {
      id: `sec-${section}-${i}`,
      reportId: "mech-export-1",
      section,
      content,
      updatedAt: "2024-10-31T00:00:00.000Z",
    };
  });
}

function carolynStyleSections(): ReportSectionRecord[] {
  return mechanicalSections().map((row) => {
    if (row.section === "requirements_verified") {
      return {
        ...row,
        content: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "All requirements detailed in the Solea M3 Perioguide System & Hardware Test Plan (825-00104 Rev. B) were verified during the partial executions of test protocols 825-00024 Rev. G and 825-00025 Rev F, respectively. See the tables below for a summary of results.",
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "i",
                    marks: [{ type: "italic" }],
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "See Deviation #02, deemed Not Applicable to the current testing execution",
                    marks: [{ type: "italic" }],
                  },
                ],
              },
            ],
          },
          hardwareTable: tableDoc([
            [...MECHANICAL_RESULTS_HEADERS],
            [
              "M3-HRS-BD-011",
              "Power shall not drop 20%.",
              "Not Applicable / Refer to Deviation #2",
              "Pass*",
            ],
          ]),
          systemTable: tableDoc([
            [...MECHANICAL_RESULTS_HEADERS],
            [
              "M3-SYS-FN-037",
              "Tip detach torque.",
              "See data sheets in Appendix A.",
              "Pass",
            ],
          ]),
        },
      };
    }
    if (row.section === "units_under_test") {
      return {
        ...row,
        content: {
          narrative: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Six (6) Solea systems made up a total of eight (8) unique UUT's.",
                  },
                ],
              },
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "*The adapter was a prototype that was functionally equivalent to SUB-00450 Rev. 6*",
                  },
                ],
              },
            ],
          },
          table: tableDoc([
            [...MECHANICAL_UUT_HEADERS],
            [
              "CO2 Sensor Handpiece Adapter",
              "Convergent Dental",
              "SUB-00468",
              "N/A",
              "2*",
            ],
          ]),
        },
      };
    }
    return row;
  });
}

describe("mechanical DV DOCX template", () => {
  it("is a valid docx with the numbered-section placeholders", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");

    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(() => {
      const parsed = new DOMParser().parseFromString(xml, "text/xml");
      const err = parsed.getElementsByTagName("parsererror")[0];
      if (err) throw new Error(err.textContent ?? "invalid xml");
    }).not.toThrow();

    for (const heading of [
      "PURPOSE:",
      "SCOPE:",
      "1. Testers/Dates:",
      "2. Methods of Measurement",
      "2.1 Executed Protocol:",
      "2.2 Protocol Deviations:",
      "2.4 Test Equipment:",
      "3. Failure/Out of Specification Forms:",
      "4. Results and Discussion:",
      "4.1 Data Collection Forms:",
      "4.2 Requirements Verified:",
      "4.3 Observations:",
      "5. Problem or Failure Resolution:",
      "6. Conclusion:",
      "Revision History",
    ]) {
      expect(xml, heading).toContain(heading);
    }

    for (const tag of [
      "{@purposeXml}",
      "{@executedProtocolXml}",
      "{@protocolDeviationsXml}",
      "{@uutTableXml}",
      "{@equipmentTableXml}",
      "{@failuresXml}",
      "{@hardwareResultsTableXml}",
      "{@systemResultsTableXml}",
      "{@observationsXml}",
      "{@revisionHistoryTableXml}",
    ]) {
      expect(xml, tag).toContain(tag);
    }

    // Identity block placeholders
    expect(xml).toContain("{projectName}");
    expect(xml).toContain("{dhfIndexNo}");
    expect(xml).toContain("{projectLeader}");
    expect(xml).toContain("{ecoDcoNo}");

    // No software-report leftovers
    expect(xml).not.toContain("{@methodsXml}");
    expect(xml).not.toContain("{@deviationsXml}");
    expect(xml).not.toContain("Table 4: Requirements Verified");
  });

  it("keeps the 731-00008 footer and retitles the header", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    const header = zip.file("word/header1.xml")?.asText() ?? "";
    const footer = zip.file("word/footer1.xml")?.asText() ?? "";

    expect(header).toContain("System and Hardware Verification Test Report");
    expect(header).not.toContain("Software Design Verification Test Report");
    expect(header).toContain("{productName}");
    expect(header).toContain("{documentNo}");
    expect(header).toContain("{revision}");

    expect(footer).toContain("Verification Test Report Template, 731-00008");
    expect(footer).toContain("COMPANY PROPRIETARY AND CONFIDENTIAL");
  });
});

describe("mechanical DV DOCX export", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "convergent";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "convergent";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("renders every section and both results tables", async () => {
    const buf = await generateReportDocx({
      report: mechanicalReport(),
      sections: mechanicalSections(),
    });
    const zip = new PizZip(buf);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    const header = zip.file("word/header1.xml")?.asText() ?? "";

    // No unrendered placeholders left behind.
    expect(xml).not.toMatch(/\{@?\w+Xml\}/);
    expect(xml).not.toContain("{projectLeader}");

    expect(header).toContain("Solea Model 3 Perioguide");
    expect(header).toContain("825-00101");

    expect(xml).toContain("Charles Kerbage");
    expect(xml).toContain("DCO-02058");
    expect(xml).toContain("825-00003");
    expect(xml).toContain("Partial executions of 825-00024, Rev. G");
    expect(xml).toContain("five (5) deviations");
    expect(xml).toContain("eight (8) unique UUT");
    expect(xml).toContain("one (1) failure encountered");

    // Both discipline tables land, hardware before system.
    const hardwareAt = xml.indexOf("M3-HRS-GN-001");
    const systemAt = xml.indexOf("M3-SYS-SW-007");
    expect(hardwareAt).toBeGreaterThan(-1);
    expect(systemAt).toBeGreaterThan(-1);
    expect(hardwareAt).toBeLessThan(systemAt);

    // Req ID / Notes/Results tables match the Convergent source report (landscape).
    const landscapeBreaks = [...xml.matchAll(/w:orient="landscape"/g)];
    expect(landscapeBreaks.length).toBeGreaterThanOrEqual(2);
    expect(
      landscapeBreaks.some(
        (m) => (m.index ?? 0) > hardwareAt && (m.index ?? 0) < systemAt
      )
    ).toBe(true);
    expect(landscapeBreaks.some((m) => (m.index ?? 0) > systemAt)).toBe(true);

    // Other 4-column content (revision history) stays portrait — only the
    // hardware/system results tables force landscape.
    const revisionAt = xml.indexOf("W. Harrington / D. Burke");
    expect(revisionAt).toBeGreaterThan(systemAt);
    const landscapeAfterRevision = landscapeBreaks.some(
      (m) => (m.index ?? 0) > revisionAt
    );
    expect(landscapeAfterRevision).toBe(false);

    expect(xml).toContain("W. Harrington / D. Burke");
    expect(xml).toContain(
      "has been deemed acceptable for release on the Solea Model 3"
    );

    // Deviations and failures stay in their own sections.
    const deviationsAt = xml.indexOf("2.2 Protocol Deviations");
    const failuresAt = xml.indexOf("3. Failure/Out of Specification Forms");
    expect(deviationsAt).toBeGreaterThan(-1);
    expect(failuresAt).toBeGreaterThan(deviationsAt);

    const paras = xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
    const styleOf = (text: string) =>
      paras.find((p) => docxParagraphPlainText(p) === text)?.match(
        /<w:pStyle w:val="([^"]+)"/
      )?.[1] ?? null;
    expect(styleOf("PURPOSE:")).toBe("Heading1");
    expect(styleOf("1. Testers/Dates:")).toBe("Heading1");
    expect(styleOf("2. Methods of Measurement")).toBe("Heading1");
    expect(styleOf("2.1 Executed Protocol:")).toBe("Heading2");
    expect(styleOf("2.4 Test Equipment:")).toBe("Heading2");
    expect(styleOf("4.2 Requirements Verified:")).toBe("Heading2");
    expect(styleOf("6. Conclusion:")).toBe("Heading1");
    expect(styleOf("Revision History")).toBe("Heading1");
  });

  it("places table footnotes under the table on the landscape page", async () => {
    const buf = await generateReportDocx({
      report: mechanicalReport(),
      sections: carolynStyleSections(),
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";

    const hardwareAt = xml.indexOf("M3-HRS-BD-011");
    const systemAt = xml.indexOf("M3-SYS-FN-037");
    const footnoteAt = xml.indexOf(
      "deemed Not Applicable to the current testing execution"
    );
    const headingAt = xml.indexOf("4.2 Requirements Verified");
    expect(hardwareAt).toBeGreaterThan(headingAt);
    expect(systemAt).toBeGreaterThan(hardwareAt);
    expect(footnoteAt).toBeGreaterThan(hardwareAt);
    expect(footnoteAt).toBeLessThan(systemAt);

    const leadIn = xml.slice(headingAt, hardwareAt);
    expect(leadIn).toContain("See the tables below");
    expect(leadIn).not.toContain("Deviation #02");
    expect(leadIn).not.toMatch(/<w:t[^>]*>i<\/w:t>/);

    const landscapeAfterHardware = [...xml.matchAll(/w:orient="landscape"/g)].find(
      (m) => (m.index ?? 0) > hardwareAt
    );
    expect(landscapeAfterHardware?.index).toBeGreaterThan(footnoteAt);

    const innerTables =
      xml.match(/<w:tbl>(?:(?!<w:tbl>)[\s\S])*?<\/w:tbl>/g) ?? [];
    const hardwareInner =
      innerTables.find((table) => table.includes("M3-HRS-BD-011")) ?? "";
    const systemInner =
      innerTables.find((table) => table.includes("M3-SYS-FN-037")) ?? "";
    expect(hardwareInner).toContain("Pass/Fail");
    expect(hardwareInner).toContain("M3-HRS-BD-011");
    expect(systemInner).not.toContain("Deviation #02");

    const cols = [...hardwareInner.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) =>
      parseInt(m[1]!, 10)
    );
    expect(cols).toHaveLength(4);
    const sum = cols.reduce((a, b) => a + b, 0);
    expect(cols[0]! / sum).toBeCloseTo(0.16, 2);
    expect(cols[3]! / sum).toBeCloseTo(0.14, 2);
    expect(cols[3]!).toBeGreaterThan(1500);

    const uutAt = xml.indexOf("SUB-00468");
    const uniqueUutAt = xml.indexOf("unique UUT");
    const prototypeAt = xml.indexOf("functionally equivalent");
    expect(uutAt).toBeGreaterThan(uniqueUutAt);
    expect(prototypeAt).toBeGreaterThan(uutAt);
    expect(xml.slice(uniqueUutAt, uutAt)).not.toContain("functionally equivalent");
  });

  it("names the exported file for the mechanical type", () => {
    expect(
      reportExportDocxFileName("mechanical_design_verification", "825-00101")
    ).toBe("Mechanical_DV_Report_825-00101.docx");
  });
});
