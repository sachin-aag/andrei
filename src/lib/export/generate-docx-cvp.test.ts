import fs from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { reports } from "@/db/schema";
import { generateReportDocx } from "@/lib/export/generate-docx";
import {
  CVP_FORM_NO,
  CVP_SECTION_KEYS,
  EMPTY_CVP_CONTENT,
  type CvpSectionContent,
  type CvpSectionKey,
} from "@/lib/document-types/cvp/sections";
import type { ReportSectionRecord } from "@/types/report";

const TEMPLATE = path.join(
  process.cwd(),
  "templates",
  "3xper-cleaning-verification-protocol-template.docx"
);

function cvpReport(): typeof reports.$inferSelect {
  return {
    id: "cvp-1",
    documentType: "cleaning_verification_protocol",
    documentNo: "CVRP-ISM4-26-001",
    date: new Date("2026-04-08"),
    authorId: "user-1",
    assignedManagerId: null,
    reviewedById: null,
    deletedAt: null,
    deletedById: null,
    metadata: {
      productName: "Isosorbide Mononitrate (ISM Stage-4)",
      productCode: "ISM",
      stage: "ISM4",
      plant: "Production Block-2",
      department: "Production",
      version: "00",
      effectiveDate: "08-Apr-2026",
      documentTitle:
        "Cleaning Verification Protocol for Equipment and Associated Auxiliary Systems Used in the Production of Isosorbide Mononitrate (Stage-4)",
    },
    status: "draft",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };
}

function sectionsWith(
  overrides: Partial<Record<CvpSectionKey, CvpSectionContent>> = {}
): ReportSectionRecord[] {
  return CVP_SECTION_KEYS.map((key) => ({
    id: key,
    reportId: "cvp-1",
    section: key,
    content: (overrides[key] ?? EMPTY_CVP_CONTENT[key]) as ReportSectionRecord["content"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

function visibleText(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
}

async function exportZip(sections: ReportSectionRecord[]) {
  return new PizZip(await generateReportDocx({ report: cvpReport(), sections }));
}

describe("cleaning verification protocol DOCX export", () => {
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

  it("keeps A4 chrome, the header logo, and a slot per section", () => {
    expect(fs.existsSync(TEMPLATE)).toBe(true);
    const zip = new PizZip(fs.readFileSync(TEMPLATE));
    expect(Object.keys(zip.files)[0]).toBe("[Content_Types].xml");
    expect(zip.file("word/media/image9.png")).toBeTruthy();
    expect(zip.file("word/media/image1.png")).toBeFalsy();
    const document = zip.file("word/document.xml")?.asText() ?? "";
    expect(document).toContain("w:w=\"11910\"");
    expect(document).toContain("w:h=\"16840\"");
    for (const key of CVP_SECTION_KEYS) {
      expect(document).toContain(`{@${key}Xml}`);
    }
    expect(visibleText(zip.file("word/footer1.xml")?.asText() ?? "")).toContain(
      CVP_FORM_NO.replace("PS-003", "PS- 003")
    );
  });

  it("fills cover identity and leaves no template tags", async () => {
    const zip = await exportZip(sectionsWith());
    const body = visibleText(zip.file("word/document.xml")?.asText() ?? "");
    const header = visibleText(zip.file("word/header1.xml")?.asText() ?? "");
    expect(body).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(body).toContain("Isosorbide Mononitrate (ISM Stage-4)");
    expect(body).toContain("Production Block-2");
    expect(body).toContain("1.0 Approval Signatures");
    expect(body).toContain("15.1 Equipment Sampling Plans");
    expect(header).toContain("CVRP-ISM4-26-001");
    expect(header).toContain("Production");
    expect(visibleText(zip.file("word/header2.xml")?.asText() ?? "")).toContain(
      "08-Apr-2026"
    );
  });
});
