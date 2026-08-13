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
  it("keeps the investigation header free of leftover Refe text and stretched logo", () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
    const header2 = zip.file("word/header2.xml")!.asText();
    const logo = zip.file("word/media/image1.png")!.asNodeBuffer();
    const dims = readPngDimensions(logo)!;

    expect(header2).toContain("Investigation Report");
    expect(header2).toContain("Andrei");
    expect(header2).not.toMatch(/<w:t>Ref<\/w:t>/);
    expect(header2).not.toMatch(/<w:t>,<\/w:t>/);
    expect(header2).not.toMatch(/<w:t>\.<\/w:t>/);

    const wpCx = Number(header2.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)?.[1]);
    const wpCy = Number(header2.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/)?.[2]);
    const picCy = Number(
      header2.match(/<a:xfrm>\s*<a:off [^/]*\/>\s*<a:ext cx="\d+" cy="(\d+)"\/>/)?.[1]
    );
    const expectedCy = Math.round((wpCx * dims.height) / dims.width);
    expect(wpCy).toBe(expectedCy);
    expect(picCy).toBe(expectedCy);
  });

  it("upscales the template header logo and removes useLocalDpi", async () => {
    const zip = new PizZip(fs.readFileSync(TEMPLATE_PATH));
    const before = zip.file("word/media/image1.png")!.asNodeBuffer();
    const beforeDims = readPngDimensions(before)!;

    await applyGoogleDocsImageCompat(zip);

    const after = zip.file("word/media/image1.png")!.asNodeBuffer();
    const afterDims = readPngDimensions(after)!;
    expect(Math.max(afterDims.width, afterDims.height)).toBeGreaterThanOrEqual(320);
    if (Math.max(beforeDims.width, beforeDims.height) < 320) {
      expect(Math.max(afterDims.width, afterDims.height)).toBeGreaterThan(
        Math.max(beforeDims.width, beforeDims.height)
      );
    }

    const header2 = zip.file("word/header2.xml")!.asText();
    expect(header2).not.toContain("useLocalDpi");
    expect(header2).not.toMatch(/SOP\/DP\/QA\/008/i);
    expect(header2).not.toMatch(/M\.J\./i);
    const cyMatch = header2.match(/wp:extent cx="\d+" cy="(\d+)"/);
    expect(cyMatch).not.toBeNull();
    const cy = Number(cyMatch![1]);
    const aspectCy = Math.round((457200 * afterDims.height) / afterDims.width);
    expect(cy).toBe(aspectCy);
    const picCy = Number(
      header2.match(/<a:xfrm>\s*<a:off [^/]*\/>\s*<a:ext cx="\d+" cy="(\d+)"\/>/)?.[1]
    );
    expect(picCy).toBe(aspectCy);
  });
});
