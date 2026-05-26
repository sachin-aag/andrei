import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import {
  applySignatureBlockToDocumentXml,
  extractSignatureBlockFromDocxBuffer,
  findSignatureRowPair,
} from "@/lib/docx/signature-block";

const fixturePath = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation  DEV-PK-25-002.docx"
);

describe("signature-block", () => {
  it("finds the bottom sign-off row pair", () => {
    const texts = [
      "Attachment No. I: Photo",
      "Prepared By (Sign/Date) Reviewed By (Sign/Date) Approved By QA (Sign/Date)",
      "",
    ];
    expect(findSignatureRowPair(texts)).toEqual({ headerIndex: 1, dataIndex: 2 });
  });

  it("extracts sign-off rows with the same column count as the upload", () => {
    if (!fs.existsSync(fixturePath)) return;

    const block = extractSignatureBlockFromDocxBuffer(fs.readFileSync(fixturePath));
    expect(block).not.toBeNull();

    const headerCells = block!.table.content?.[0]?.content ?? [];
    const dataCells = block!.table.content?.[1]?.content ?? [];
    expect(headerCells.length).toBe(8);
    expect(dataCells.length).toBe(8);

    const headerTc = (block!.headerRowXml.match(/<w:tc\b/g) ?? []).length;
    const dataTc = (block!.dataRowXml.match(/<w:tc\b/g) ?? []).length;
    expect(headerTc).toBe(8);
    expect(dataTc).toBe(8);
  });

  it("replaces template sign-off rows without changing column count", () => {
    if (!fs.existsSync(fixturePath)) return;

    const uploaded = extractSignatureBlockFromDocxBuffer(fs.readFileSync(fixturePath));
    expect(uploaded).not.toBeNull();

    const templatePath = path.join(
      process.cwd(),
      "templates",
      "investigation-report-template.docx"
    );
    const templateXml = new PizZip(fs.readFileSync(templatePath))
      .file("word/document.xml")!
      .asText();

    const patched = applySignatureBlockToDocumentXml(templateXml, uploaded!);
    expect(patched).toContain(uploaded!.headerRowXml.slice(0, 80));
    const sigTables = [...patched.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)].filter(
      (m) => /\bPrepared\b/i.test(m[0]) && /\bSign\/Date\b/i.test(m[0])
    );
    expect(sigTables.length).toBeGreaterThan(0);
    const headerRow = sigTables[sigTables.length - 1]![0].match(
      /<w:tr\b[\s\S]*?<\/w:tr>/i
    )?.[0];
    expect(headerRow).toBeTruthy();
    const headerTc = (headerRow!.match(/<w:tc\b/g) ?? []).length;
    expect(headerTc).toBe(8);
  });
});
