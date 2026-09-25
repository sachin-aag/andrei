import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOCUMENT_AI_OCR_CONCURRENCY,
  DOCUMENT_AI_ONLINE_PAGE_LIMIT,
  DOCUMENT_AI_PAGES_IN_FLIGHT,
  DOCUMENT_AI_REQUIRED_ERROR,
  assertPdfIngestConfigured,
  documentAiIngestSplitOptions,
  mapDocumentAiPages,
  textFromAnchor,
} from "./document-ai-ocr";

async function bornDigitalPdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 800]);
  const lines = Array.from(
    { length: 16 },
    (_, index) => `Born-digital requirement row ${index} SW-EVAL-7 interlock`
  );
  lines.forEach((line, index) => {
    page.drawText(line, { x: 40, y: 740 - index * 16, size: 11, font });
  });
  return Buffer.from(await document.save());
}

async function emptyPagePdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([600, 800]);
  return Buffer.from(await document.save());
}

describe("assertPdfIngestConfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows a born-digital PDF when Document AI is not configured", async () => {
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "eval-project");
    vi.stubEnv("DOCUMENT_AI_PROCESSOR_ID", "");
    vi.stubEnv("DOCUMENT_AI_LOCATION", "");
    await expect(
      assertPdfIngestConfigured(await bornDigitalPdf())
    ).resolves.toBeUndefined();
  });

  it("rejects a scan when Document AI is not configured", async () => {
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "eval-project");
    vi.stubEnv("DOCUMENT_AI_PROCESSOR_ID", "");
    vi.stubEnv("DOCUMENT_AI_LOCATION", "");
    await expect(assertPdfIngestConfigured(await emptyPagePdf())).rejects.toThrow(
      DOCUMENT_AI_REQUIRED_ERROR
    );
  });

  it("skips the text-layer check when Document AI is configured", async () => {
    vi.stubEnv("GOOGLE_VERTEX_PROJECT", "eval-project");
    vi.stubEnv("DOCUMENT_AI_PROCESSOR_ID", "processor-1");
    vi.stubEnv("DOCUMENT_AI_LOCATION", "us");
    await expect(
      assertPdfIngestConfigured(await emptyPagePdf())
    ).resolves.toBeUndefined();
  });
});

describe("Enterprise OCR ingest waves", () => {
  it("schedules 15-page slices with 45 pages in flight", () => {
    expect(DOCUMENT_AI_ONLINE_PAGE_LIMIT).toBe(15);
    expect(DOCUMENT_AI_OCR_CONCURRENCY).toBe(3);
    expect(DOCUMENT_AI_PAGES_IN_FLIGHT).toBe(45);
    expect(documentAiIngestSplitOptions()).toEqual({
      preferredPagesPerBatch: 15,
      maxPagesPerBatch: 15,
      maxBatchBytes: 40 * 1024 * 1024,
    });
  });
});

describe("mapDocumentAiPages", () => {
  it("slices full text with page anchors and remaps relative page numbers", () => {
    const full = "COVER\n\nTABLE OF CONTENTS\nSW-PA-1";
    const pages = mapDocumentAiPages(
      {
        text: full,
        pages: [
          {
            pageNumber: 1,
            layout: {
              textAnchor: {
                textSegments: [{ startIndex: 0, endIndex: 5 }],
              },
              confidence: 0.91,
            },
          },
          {
            pageNumber: 2,
            layout: {
              textAnchor: {
                textSegments: [{ startIndex: 7, endIndex: full.length }],
              },
              confidence: 0.8,
            },
          },
        ],
      },
      4
    );

    expect(pages).toEqual([
      { pageNumber: 4, transcript: "COVER", confidence: 0.91 },
      {
        pageNumber: 5,
        transcript: "TABLE OF CONTENTS\nSW-PA-1",
        confidence: 0.8,
      },
    ]);
  });

  it("joins multiple text segments", () => {
    expect(
      textFromAnchor("abcdefghij", {
        textSegments: [
          { startIndex: 0, endIndex: 3 },
          { startIndex: 6, endIndex: 9 },
        ],
      })
    ).toBe("abcghi");
  });
});
