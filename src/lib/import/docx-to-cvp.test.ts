import fs from "node:fs";
import path from "node:path";
import type { JSONContent } from "@tiptap/core";
import PizZip from "pizzip";
import { describe, expect, it, vi } from "vitest";
import {
  extractCvpHeaderFields,
  isCvpTocLine,
  isEquipmentHeading,
  protocolNoFromCompactHeader,
  splitCvpNarrativeIntoSections,
  docxBufferToImportedCvp,
} from "@/lib/import/docx-to-cvp";

vi.mock("@/lib/import/extract-math-from-image", () => ({
  extractMathFromImage: vi.fn(async () => null),
}));

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.header+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`;

function wrapDocumentXml(bodyInner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${bodyInner}<w:sectPr/></w:body></w:document>`
  );
}

function heading1(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function para(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function coverTable(): string {
  const row = (label: string, value: string) =>
    `<w:tr>` +
    `<w:tc><w:p><w:r><w:t>${label}</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t>:</w:t></w:r></w:p></w:tc>` +
    `<w:tc><w:p><w:r><w:t>${value}</w:t></w:r></w:p></w:tc>` +
    `</w:tr>`;
  return (
    `<w:tbl>` +
    `<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="400"/><w:gridCol w:w="4000"/></w:tblGrid>` +
    row("Name of the product", "Isosorbide Mononitrate (ISM Stage-4)") +
    row("Product Code", "ISM") +
    row("Stage", "ISM4") +
    row("Plant", "Production Block-2") +
    `</w:tbl>`
  );
}

function headerXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:p><w:r><w:t>Document Title: Cleaning Verification Protocol for Equipment and Associated Auxiliary Systems Used in the Production of Isosorbide Mononitrate (Stage-4)</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Department Production</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Protocol No. CVRP-ISM4-26-001 Version # 00</w:t></w:r></w:p>` +
    `</w:hdr>`
  );
}

function minimalCvpDocx(): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  zip.file("word/header1.xml", headerXml());
  zip.file(
    "word/document.xml",
    wrapDocumentXml(
      coverTable() +
        heading1("TABLE OF CONTENTS") +
        para("1.0APPROVAL SIGNATURES3") +
        heading1("APPROVAL SIGNATURES") +
        para("Prepared by Quality Assurance") +
        heading1("OBJECTIVE") +
        para("Objective of this protocol is to conduct cleaning verification.") +
        heading1("SCOPE") +
        para("This protocol applies to the manufacturing equipment given below.") +
        heading1("MIXED VESSEL (MV-1304):") +
        para("Capacity 20 KL") +
        heading1("NITROSAMINE LIMITS IN THE RINSE SAMPLES:") +
        `<w:tbl><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>` +
        `<w:tr>` +
        `<w:tc><w:p><w:r><w:t>Limit NMT (ppm)</w:t></w:r></w:p></w:tc>` +
        `<w:tc><w:p><w:r><w:t>NDMA</w:t></w:r></w:p></w:tc>` +
        `</w:tr></w:tbl>`
    )
  );
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

function p(text: string): JSONContent {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}

function h(text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text }],
  };
}

function cell(text: string): JSONContent {
  return {
    type: "tableCell",
    content: [p(text)],
  };
}

function table(rows: string[][]): JSONContent {
  return {
    type: "table",
    content: rows.map((row) => ({
      type: "tableRow",
      content: row.map((text) => cell(text)),
    })),
  };
}

describe("CVP Word import split", () => {
  it("maps numbered TOC glue to skip and equipment IDs to 15.1", () => {
    expect(isCvpTocLine("1.0APPROVAL SIGNATURES3")).toBe(true);
    expect(isCvpTocLine("APPROVAL SIGNATURES")).toBe(false);
    expect(isEquipmentHeading("MIXED VESSEL (MV-1304):")).toBe(true);
    expect(isEquipmentHeading("15.4 GLASS LINED REACTOR (GLR-1304):")).toBe(
      true
    );
    expect(
      isEquipmentHeading("NITROSAMINE LIMITS IN THE RINSE SAMPLES:")
    ).toBe(false);
  });

  it("reads protocol no from a spaced header string", () => {
    expect(
      protocolNoFromCompactHeader("Protocol No . C VR P-ISM 4 -2 6 -00 1 Version # 00")
    ).toBe("CVRP-ISM4-26-001");
  });

  it("splits headings into CVP sections and cover identity", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        table([
          ["Name of the product", ":", "Isosorbide Mononitrate (ISM Stage-4)"],
          ["Product Code", ":", "ISM"],
          ["Stage", ":", "ISM4"],
          ["Plant", ":", "Production Block-2"],
        ]),
        h("TABLE OF CONTENTS"),
        p("1.0APPROVAL SIGNATURES3"),
        h("APPROVAL SIGNATURES"),
        table([["Function", "Department", "Name"]]),
        h("OBJECTIVE"),
        p("Conduct cleaning verification of the manufacturing equipment."),
        h("MIXED VESSEL (MV-1304):"),
        p("Capacity 20 KL"),
        h("NITROSAMINE LIMITS IN THE RINSE SAMPLES:"),
        table([["Limit NMT (ppm)", "NDMA"]]),
      ],
    };
    const { cover, sections } = splitCvpNarrativeIntoSections(doc);
    expect(cover).toMatchObject({
      productName: "Isosorbide Mononitrate (ISM Stage-4)",
      productCode: "ISM",
      stage: "ISM4",
      plant: "Production Block-2",
    });
    expect(JSON.stringify(sections.cvp_objective)).toContain(
      "Conduct cleaning verification"
    );
    expect(JSON.stringify(sections.cvp_approvals)).toContain("Function");
    expect(JSON.stringify(sections.cvp_equipment_sampling)).toContain("MV-1304");
    expect(JSON.stringify(sections.cvp_equipment_sampling)).toContain("20 KL");
    expect(JSON.stringify(sections.cvp_nitrosamine)).toContain("NDMA");
    expect(sections.cvp_scope).toBeUndefined();
  });

  it("reads cover identity from flattened label/value paragraphs", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        p("Name of the product"),
        p(":"),
        p("Isosorbide Mononitrate (ISM Stage-4)"),
        p("Product Code"),
        p(":"),
        p("ISM"),
        p("Stage"),
        p(":"),
        p("ISM4"),
        p("Plant"),
        p(":"),
        p("Production Block-2"),
        h("OBJECTIVE"),
        p("Conduct cleaning verification."),
      ],
    };
    expect(splitCvpNarrativeIntoSections(doc).cover).toMatchObject({
      productName: "Isosorbide Mononitrate (ISM Stage-4)",
      productCode: "ISM",
      stage: "ISM4",
      plant: "Production Block-2",
    });
  });
});

describe("CVP Word import from docx", () => {
  it("imports a minimal protocol into identity and sections", async () => {
    const imported = await docxBufferToImportedCvp(minimalCvpDocx());
    expect(imported.protocolNo).toBe("CVRP-ISM4-26-001");
    expect(imported.metadata.productName).toContain("Isosorbide Mononitrate");
    expect(imported.metadata.productCode).toBe("ISM");
    expect(imported.metadata.stage).toBe("ISM4");
    expect(imported.metadata.plant).toBe("Production Block-2");
    expect(imported.metadata.department).toBe("Production");
    expect(imported.metadata.version).toBe("00");
    expect(JSON.stringify(imported.sections.cvp_objective)).toContain(
      "cleaning verification"
    );
    expect(JSON.stringify(imported.sections.cvp_equipment_sampling)).toContain(
      "MV-1304"
    );
    expect(JSON.stringify(imported.sections.cvp_nitrosamine)).toContain("NDMA");
  });

  it("reads protocol identity from the 3xper sample header without mammoth", () => {
    const sample = path.join(
      process.cwd(),
      "docs/sample_files/3xper-cleaning-verification-protocol-source.docx"
    );
    if (!fs.existsSync(sample)) return;
    const header = extractCvpHeaderFields(fs.readFileSync(sample));
    expect(header.protocolNo).toBe("CVRP-ISM4-26-001");
    expect(header.version).toBe("00");
    expect(header.department).toMatch(/Production/i);
    expect(header.documentTitle).toMatch(/Cleaning Verification Protocol/i);
  });
});
