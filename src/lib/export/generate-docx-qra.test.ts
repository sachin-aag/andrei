import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import { DOMParser } from "@xmldom/xmldom";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { reportExportDocxFileName } from "@/lib/export/docx-filename";
import { generateReportDocx } from "@/lib/export/generate-docx";
import {
  EMPTY_QRA_CONTENT,
  QRA_FMEA_HEADERS,
  QRA_SECTION_KEYS,
} from "@/lib/document-types/qra/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "mj-quality-risk-assessment-template.docx"
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

function qraReport(): typeof reports.$inferSelect {
  return {
    id: "qra-export-1",
    documentType: "quality_risk_assessment",
    documentNo: "RA/DP/QA/26/001",
    date: new Date("2026-03-09"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {
      revision: "R00",
      department: "Quality Assurance",
      title: "Filling line QRA",
      productName: "Injectable batch process",
      sourceDocumentName: "",
      sourceDocumentNo: "",
      idNo: "",
      preApproval: "",
      postApproval: "",
    },
    status: "draft",
    createdAt: new Date("2026-03-09"),
    updatedAt: new Date("2026-03-09"),
  };
}

function qraSections(): ReportSectionRecord[] {
  return QRA_SECTION_KEYS.map((section, i) => {
    const base = EMPTY_QRA_CONTENT[section] as Record<string, unknown>;
    let content: Record<string, unknown> = { ...base };
    if (section === "qra_objective") {
      content = {
        narrative: narrativeDoc(
          "The objective of this document is to perform quality risk management for the filling line."
        ),
      };
    } else if (section === "qra_fmea") {
      content = {
        narrative: narrativeDoc("Failures considering current controls."),
        table: tableDoc([
          [...QRA_FMEA_HEADERS],
          [
            "R01",
            "Filling",
            "Underfill",
            "Weight check skip",
            "Subpotent dose",
            "3",
            "In-process check",
            "2",
            "Checkweigher",
            "2",
            "12 (Medium)",
            "No",
            "Retrain operators",
            "Production / 30-Apr-2026",
            "3",
            "1",
            "2",
            "6 (Low)",
            "Yes",
          ],
        ]),
      };
    }
    return {
      id: `sec-${section}-${i}`,
      reportId: "qra-export-1",
      section,
      content,
      updatedAt: "2026-03-09T00:00:00.000Z",
    };
  });
}

describe("QRA DOCX template", () => {
  it("is a valid docx with F02 placeholders", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(() => {
      const parsed = new DOMParser().parseFromString(xml, "text/xml");
      const err = parsed.getElementsByTagName("parsererror")[0];
      if (err) throw new Error(err.textContent ?? "invalid xml");
    }).not.toThrow();
    for (const tag of [
      "{@objectiveXml}",
      "{@fmeaTableXml}",
      "{@residualTableXml}",
      "{@revisionHistoryTableXml}",
      "{documentNo}",
      "{assessmentMode}",
    ]) {
      expect(xml, tag).toContain(tag);
    }
  });
});

describe("QRA DOCX export", () => {
  const previous = {
    ANDREI_CUSTOMER: process.env.ANDREI_CUSTOMER,
    NEXT_PUBLIC_ANDREI_CUSTOMER: process.env.NEXT_PUBLIC_ANDREI_CUSTOMER,
    ANDREI_VERCEL_DEPLOY_SCOPE: process.env.ANDREI_VERCEL_DEPLOY_SCOPE,
  };

  beforeEach(() => {
    process.env.ANDREI_CUSTOMER = "mj";
    process.env.NEXT_PUBLIC_ANDREI_CUSTOMER = "mj";
    delete process.env.ANDREI_VERCEL_DEPLOY_SCOPE;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("renders FMEA content and the RA number", async () => {
    const buf = await generateReportDocx({
      report: qraReport(),
      sections: qraSections(),
    });
    const zip = new PizZip(buf);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).not.toMatch(/\{@?\w+Xml\}/);
    expect(xml).toContain("filling line");
    expect(xml).toContain("Underfill");
    expect(xml).toContain("12 (Medium)");
    expect(xml).toContain("RA/DP/QA/26/001");
  });

  it("names the exported file for the QRA type", () => {
    expect(
      reportExportDocxFileName("quality_risk_assessment", "RA/DP/QA/26/001")
    ).toBe("Quality_Risk_Assessment_RA-DP-QA-26-001.docx");
  });
});
