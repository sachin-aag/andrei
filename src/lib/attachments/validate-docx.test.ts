import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateDocx } from "@/lib/attachments/validate-docx";

const docxFixture = path.join(
  process.cwd(),
  "docs",
  "sample_files",
  "Investigation  DEV-PK-25-002.docx"
);

describe("validateDocx", () => {
  it("accepts a real .docx and reports a sentinel page count", () => {
    const buffer = fs.readFileSync(docxFixture);
    expect(validateDocx(buffer)).toEqual({ pageCount: 1 });
  });

  it("rejects a PDF masquerading as a docx", () => {
    const pdf = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
    expect(() => validateDocx(pdf)).toThrow(/not a Word/i);
  });

  it("rejects arbitrary non-zip bytes", () => {
    expect(() => validateDocx(Buffer.from("hello world"))).toThrow(
      /not a Word/i
    );
  });

  it("rejects a zip archive that is not a Word document", () => {
    // Minimal empty ZIP (end-of-central-directory only) — valid ZIP magic but
    // no word/document.xml part.
    const emptyZip = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(() => validateDocx(emptyZip)).toThrow(/Word \.docx/i);
  });
});
