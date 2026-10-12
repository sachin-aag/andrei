import { describe, expect, it } from "vitest";
import {
  annotatedGroupInlineXml,
  overlayLayoutFromPhoto,
  pictureInlineXml,
} from "@/lib/export/docx-annotated-image";
import { parseImageDrawing } from "@/lib/drawings/overlay";

const drawing = parseImageDrawing({
  shapes: [
    {
      type: "arrow",
      x1: -0.2,
      y1: 0.5,
      x2: 0.4,
      y2: 0.5,
      color: "#c62828",
    },
    {
      type: "label",
      x: -0.4,
      y: 0.4,
      w: 0.18,
      h: 0.08,
      text: "S-1",
      color: "#c62828",
    },
  ],
})!;

describe("overlayLayoutFromPhoto", () => {
  it("insets the photo so overflow labels sit in the group margin", () => {
    const layout = overlayLayoutFromPhoto(100, 80, drawing, 10_000, 8_000);
    expect(layout.photoOffX).toBeGreaterThan(0);
    expect(layout.photoCx).toBeLessThan(layout.groupCx);
    expect(layout.photoOffX + layout.photoCx).toBeLessThanOrEqual(layout.groupCx);
  });
});

describe("annotatedGroupInlineXml", () => {
  it("emits a Word group with a connector arrow and a text-box label", () => {
    const layout = overlayLayoutFromPhoto(100, 80, drawing, 5_715_000, 4_572_000);
    const xml = annotatedGroupInlineXml({
      photoRelId: "rId100",
      photoFileName: "image1.png",
      drawing,
      layout,
      docPrId: 100,
      font: "Times New Roman",
    });
    expect(xml).toContain("wpg:wgp");
    expect(xml).toContain('prst="straightConnector1"');
    expect(xml).toContain("<a:tailEnd");
    expect(xml).toContain('val="C62828"');
    expect(xml).toContain("<wps:txbx>");
    expect(xml).toContain(">S-1</w:t>");
    expect(xml).toContain('r:embed="rId100"');
  });

  it("flips a leftward arrow so the tip stays at x2", () => {
    const left = parseImageDrawing({
      shapes: [{ type: "arrow", x1: 0.8, y1: 0.5, x2: 0.1, y2: 0.2, color: "#c62828" }],
    })!;
    const layout = overlayLayoutFromPhoto(100, 80, left, 1_000_000, 800_000);
    const xml = annotatedGroupInlineXml({
      photoRelId: "rId1",
      photoFileName: "p.png",
      drawing: left,
      layout,
      docPrId: 1,
      font: "Times New Roman",
    });
    expect(xml).toContain('flipH="1"');
    expect(xml).toContain('flipV="1"');
  });
});

describe("pictureInlineXml", () => {
  it("emits a normal inline picture for the Fallback", () => {
    const xml = pictureInlineXml({
      relId: "rId101",
      fileName: "image2.png",
      cx: 100,
      cy: 80,
      docPrId: 101,
    });
    expect(xml).toContain("pic:pic");
    expect(xml).not.toContain("wpg:wgp");
  });
});
