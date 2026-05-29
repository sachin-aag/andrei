import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { applyGoogleDocsImageCompat } from "@/lib/export/docx-google-docs-images";
import { readPngDimensions } from "@/lib/export/raster-dimensions";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates",
  "investigation-report-template.docx"
);

describe("applyGoogleDocsImageCompat", () => {
  it("upscales the template header logo and removes useLocalDpi", async () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
    const before = zip.file("word/media/image1.png")!.asNodeBuffer();
    const beforeDims = readPngDimensions(before)!;

    await applyGoogleDocsImageCompat(zip);

    const after = zip.file("word/media/image1.png")!.asNodeBuffer();
    const afterDims = readPngDimensions(after)!;
    expect(Math.max(afterDims.width, afterDims.height)).toBeGreaterThanOrEqual(320);
    expect(Math.max(afterDims.width, afterDims.height)).toBeGreaterThan(
      Math.max(beforeDims.width, beforeDims.height)
    );

    const header2 = zip.file("word/header2.xml")!.asText();
    expect(header2).not.toContain("useLocalDpi");
    expect(header2).toMatch(/cy="390\d+"/);
  });
});
