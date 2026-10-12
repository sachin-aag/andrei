import { describe, expect, it } from "vitest";
import {
  nextUnusedImageIndex,
  nextUnusedImageIndexFromZip,
} from "@/lib/export/docx-export-context";

describe("nextUnusedImageIndex", () => {
  it("starts at 1 when the template has no media", () => {
    expect(nextUnusedImageIndex([])).toBe(1);
    expect(nextUnusedImageIndex(["word/document.xml"])).toBe(1);
  });

  it("skips the CVP header logo at image9.png", () => {
    expect(
      nextUnusedImageIndex([
        "word/media/image9.png",
        "word/_rels/header1.xml.rels",
      ])
    ).toBe(10);
  });

  it("skips the VQ / investigation logo at image1.png", () => {
    expect(nextUnusedImageIndex(["word/media/image1.png"])).toBe(2);
  });

  it("skips the highest QSR media index, not only the logo", () => {
    expect(
      nextUnusedImageIndex([
        "word/media/image1.jpeg",
        "word/media/image2.emf",
        "word/media/image3.png",
      ])
    ).toBe(4);
  });

  it("reads media paths off a zip file map", () => {
    expect(
      nextUnusedImageIndexFromZip({
        files: {
          "word/media/image9.png": {},
          "word/header1.xml": {},
        },
      })
    ).toBe(10);
  });
});
