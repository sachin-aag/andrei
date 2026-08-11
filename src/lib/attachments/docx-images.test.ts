import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import {
  assignDocxImagesToPages,
  extractDocxEmbeddedImages,
  formatDocxPageVisualInterpretation,
} from "@/lib/attachments/docx-images";

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function docxWithImages(options: {
  paragraphs: string[];
  includeWmf?: boolean;
}): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      (options.includeWmf
        ? `<Default Extension="wmf" ContentType="image/x-wmf"/>`
        : "") +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `</Types>`
  );
  zip.folder("_rels")?.file(
    ".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
  );

  const rels: string[] = [];
  rels.push(
    `<Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>`
  );
  zip.folder("word")?.folder("media")?.file("image1.png", TINY_PNG);
  if (options.includeWmf) {
    rels.push(
      `<Relationship Id="rIdImage2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.wmf"/>`
    );
    zip.folder("word")?.folder("media")?.file("image2.wmf", Buffer.from("wmf"));
  }

  zip.folder("word")?.folder("_rels")?.file(
    "document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rels.join("") +
      `</Relationships>`
  );

  const body = options.paragraphs.join("");
  zip.folder("word")?.file(
    "document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ` +
      `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
      `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
      `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
      `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<w:body>${body}</w:body></w:document>`
  );

  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function textParagraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function imageParagraph(relId: string, alt?: string): string {
  const docPr = alt
    ? `<wp:docPr id="1" name="Picture 1" descr="${alt}"/>`
    : `<wp:docPr id="1" name="Picture 1"/>`;
  return (
    `<w:p><w:r><w:drawing><wp:inline>` +
    docPr +
    `<a:graphic><a:graphicData>` +
    `<pic:pic><pic:blipFill><a:blip r:embed="${relId}"/></pic:blipFill></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

describe("extractDocxEmbeddedImages", () => {
  it("extracts PNG images in document order with nearby text and alt text", () => {
    const buffer = docxWithImages({
      paragraphs: [
        textParagraph("Before the chart"),
        imageParagraph("rIdImage1", "Assay trend chart"),
        textParagraph("After the chart"),
      ],
    });

    const { images, totalXmlChars } = extractDocxEmbeddedImages(buffer);
    expect(images).toHaveLength(1);
    expect(images[0]?.mediaType).toBe("image/png");
    expect(images[0]?.altText).toBe("Assay trend chart");
    expect(images[0]?.nearbyText).toContain("Before the chart");
    expect(images[0]?.bytes.equals(TINY_PNG)).toBe(true);
    expect(totalXmlChars).toBeGreaterThan(0);
  });

  it("skips WMF/EMF media that vision models cannot consume", () => {
    const buffer = docxWithImages({
      paragraphs: [
        imageParagraph("rIdImage1"),
        imageParagraph("rIdImage2"),
      ],
      includeWmf: true,
    });

    const { images } = extractDocxEmbeddedImages(buffer);
    expect(images).toHaveLength(1);
    expect(images[0]?.filename).toBe("image1.png");
  });

  it("reads header logos from a real template docx", () => {
    const buffer = fs.readFileSync(
      path.join(process.cwd(), "templates", "investigation-report-template.docx")
    );
    const { images } = extractDocxEmbeddedImages(buffer);
    expect(images.length).toBeGreaterThanOrEqual(1);
    expect(images[0]?.mediaType).toBe("image/png");
  });
});

describe("assignDocxImagesToPages", () => {
  it("maps early images to early pages and late images to late pages", () => {
    const pages = [
      { pageNumber: 1, text: "a".repeat(100) },
      { pageNumber: 2, text: "b".repeat(100) },
      { pageNumber: 3, text: "c".repeat(100) },
    ];
    const images = [
      {
        ordinal: 1,
        bytes: TINY_PNG,
        mediaType: "image/png",
        filename: "early.png",
        charOffset: 10,
        nearbyText: "early",
        altText: null,
      },
      {
        ordinal: 2,
        bytes: TINY_PNG,
        mediaType: "image/png",
        filename: "late.png",
        charOffset: 250,
        nearbyText: "late",
        altText: null,
      },
    ];

    const byPage = assignDocxImagesToPages(pages, images, 300);
    expect(byPage.get(1)?.map((image) => image.ordinal)).toEqual([1]);
    expect(byPage.get(3)?.map((image) => image.ordinal)).toEqual([2]);
  });
});

describe("formatDocxPageVisualInterpretation", () => {
  it("joins figure descriptions and truncates to the visual budget", () => {
    const text = formatDocxPageVisualInterpretation([
      { ordinal: 1, description: "A stamped approval box." },
      { ordinal: 2, description: "Trend chart of assay results." },
    ]);
    expect(text).toContain("Figure 1: A stamped approval box.");
    expect(text).toContain("Figure 2: Trend chart of assay results.");
  });
});
