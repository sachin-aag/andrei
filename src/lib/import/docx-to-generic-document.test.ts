import PizZip from "pizzip";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/import/extract-math-from-image", () => ({
  extractMathFromImage: vi.fn(async () => null),
}));

import {
  docxBufferToGenericDocument,
  GenericDocxImportError,
  htmlToGenericDoc,
} from "@/lib/import/docx-to-generic-document";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

function wrapDocumentXml(bodyInner: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${bodyInner}<w:sectPr/></w:body></w:document>`
  );
}

function minimalDocx(bodyInner: string, extra?: (zip: PizZip) => void): Buffer {
  const zip = new PizZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", RELS);
  zip.file("word/_rels/document.xml.rels", DOCUMENT_RELS);
  zip.file("word/document.xml", wrapDocumentXml(bodyInner));
  extra?.(zip);
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

describe("generic document import", () => {
  it("converts mammoth-style HTML headings, paragraphs, and lists", () => {
    const doc = htmlToGenericDoc(
      "<h1>Title</h1><p>Hello <strong>world</strong>.</p><ul><li><p>one</p></li></ul>"
    );
    expect(doc.content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
    });
    expect(doc.content?.[1]?.type).toBe("paragraph");
    expect(doc.content?.[2]?.type).toBe("bulletList");
    const title = JSON.stringify(doc.content?.[0]);
    expect(title).toContain("Title");
  });

  it("imports Heading1 paragraphs from a minimal docx", async () => {
    const buf = minimalDocx(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Protocol</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>Body text.</w:t></w:r></w:p>`
    );
    const imported = await docxBufferToGenericDocument(buf);
    const types = imported.narrative.content?.map((n) => n.type) ?? [];
    expect(types).toContain("heading");
    expect(JSON.stringify(imported.narrative)).toContain("Protocol");
    expect(JSON.stringify(imported.narrative)).toContain("Body text");
  });

  it("rejects unresolved tracked changes", async () => {
    const buf = minimalDocx(
      `<w:p><w:ins w:id="1" w:author="Pat"><w:r><w:t>added</w:t></w:r></w:ins></w:p>`
    );
    await expect(docxBufferToGenericDocument(buf)).rejects.toBeInstanceOf(
      GenericDocxImportError
    );
    await expect(docxBufferToGenericDocument(buf)).rejects.toThrow(
      /tracked changes/i
    );
  });

  it("rejects macros", async () => {
    const buf = minimalDocx(`<w:p><w:r><w:t>ok</w:t></w:r></w:p>`, (zip) => {
      zip.file("word/vbaProject.bin", Buffer.from("macro"));
    });
    await expect(docxBufferToGenericDocument(buf)).rejects.toThrow(/macros/i);
  });
});
