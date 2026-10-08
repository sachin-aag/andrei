import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { createDocxExportContext } from "@/lib/export/docx-export-context";
import { applyInlineMediaToDocxZip } from "@/lib/export/docx-inline-media";

describe("applyInlineMediaToDocxZip", () => {
  it("refuses to overwrite a template media file", () => {
    const zip = new PizZip();
    zip.file("word/media/image9.png", Buffer.from("logo"));
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
    );
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`
    );
    const ctx = createDocxExportContext();
    ctx.media.push({
      relId: "rId100",
      fileName: "image9.png",
      bytes: Buffer.from("vessel"),
      contentType: "image/png",
      widthPx: 1,
      heightPx: 1,
    });
    expect(() => applyInlineMediaToDocxZip(zip, ctx)).toThrow(
      /overwrite template media image9\.png/
    );
    expect(zip.file("word/media/image9.png")?.asText()).toBe("logo");
  });
});
