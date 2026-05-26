import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { createDocxExportContext } from "@/lib/export/docx-export-context";
import {
  allocateListNumId,
  applyNumberingToDocxZip,
  loadListNumberingBasesFromZip,
  parseListNumberingBases,
} from "@/lib/export/docx-numbering";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "investigation-report-template.docx"
);

function templateNumberingXml(): string {
  const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
  return zip.file("word/numbering.xml")?.asText() ?? "";
}

describe("parseListNumberingBases", () => {
  it("reads decimal and bullet abstractNumIds from the investigation template", () => {
    const bases = parseListNumberingBases(templateNumberingXml());
    expect(bases.maxNumId).toBeGreaterThanOrEqual(34);
    expect(bases.decimal).toBeGreaterThanOrEqual(0);
    expect(bases.disc).toBeGreaterThanOrEqual(0);
    expect(bases.dash).toBeGreaterThanOrEqual(0);
  });
});

describe("allocateListNumId", () => {
  it("allocates distinct numIds and patches numbering.xml", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
    const bases = loadListNumberingBasesFromZip(zip);
    const ctx = createDocxExportContext(bases);

    const first = allocateListNumId(ctx, "orderedList");
    const second = allocateListNumId(ctx, "orderedList");
    expect(second).toBe(first + 1);
    expect(ctx.numberingPatches).toHaveLength(2);

    applyNumberingToDocxZip(zip, ctx);
    const numbering = zip.file("word/numbering.xml")?.asText() ?? "";
    expect(numbering).toContain(`<w:num w:numId="${first}">`);
    expect(numbering).toContain(`<w:num w:numId="${second}">`);
    expect(numbering).toContain(
      `<w:num w:numId="${first}"><w:abstractNumId w:val="${bases.decimal}"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`
    );
  });
});
