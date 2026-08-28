import { PDFDocument, StandardFonts } from "pdf-lib";
import { NoOutputGeneratedError, type LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();
const { ocrPdfWithDocumentAiMock, isDocumentAiConfiguredMock } = vi.hoisted(
  () => ({
    ocrPdfWithDocumentAiMock: vi.fn(),
    isDocumentAiConfiguredMock: vi.fn(() => false),
  })
);

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("./document-ai-ocr", () => ({
  isDocumentAiConfigured: () => isDocumentAiConfiguredMock(),
  ocrPdfWithDocumentAi: (...args: unknown[]) =>
    ocrPdfWithDocumentAiMock(...args),
}));

vi.mock("@/lib/ai/usage", () => ({
  assertAiBudgetAvailable: vi.fn().mockResolvedValue(undefined),
  recordAiUsage: vi.fn().mockResolvedValue(undefined),
}));

import {
  extractPdfBatch,
  extractionWarningForGaps,
  gapExtractedPage,
  isGapExtractedPage,
  remapExtractedPageNumbers,
  resolveDocumentExtractLocation,
} from "./extract-batch";

const usage = { inputTokens: 10, outputTokens: 20 };

function pagePayload(pageNumber: number, transcript = `text-${pageNumber}`) {
  return {
    pageNumber,
    transcript,
    visualInterpretation: `visual-${pageNumber}`,
    pageContext: `context-${pageNumber}`,
    printedPageLabel: null,
    confidence: 0.9,
    tables: [] as string[],
    figures: [] as string[],
  };
}

function batchPayload(
  pages: ReturnType<typeof pagePayload>[],
  batchSummary = "summary",
  continuationNote = "note"
) {
  return { pages, batchSummary, continuationNote };
}

/** Blank pages carry no text layer, so these exercise the vision path. */
async function pdfWithPages(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage();
  }
  return Buffer.from(await document.save());
}

/** Real text layer, so these exercise the parser-first path. */
async function pdfWithTextPages(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([600, 800]);
    for (let line = 0; line < 12; line += 1) {
      page.drawText(`slice ${index} line ${line} of verification evidence`, {
        x: 40,
        y: 740 - line * 16,
        size: 11,
        font,
      });
    }
  }
  return Buffer.from(await document.save());
}

async function pdfWithMixedTextPages(): Promise<Buffer> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const addTextPage = (marker: string) => {
    const page = document.addPage([600, 800]);
    for (let line = 0; line < 12; line += 1) {
      page.drawText(`${marker} line ${line} of verification evidence`, {
        x: 40,
        y: 740 - line * 16,
        size: 11,
        font,
      });
    }
  };
  addTextPage("alpha");
  document.addPage([600, 800]);
  addTextPage("gamma");
  return Buffer.from(await document.save());
}

function insightPayload(pageNumber: number) {
  return {
    pageNumber,
    visualInterpretation: `visual-${pageNumber}`,
    pageContext: `context-${pageNumber}`,
    printedPageLabel: null,
    confidence: 0.8,
    tables: [] as string[],
    figures: [] as string[],
  };
}

function stubModel(): LanguageModel {
  return { modelId: "stub" } as LanguageModel;
}

function userPrompt(args: unknown): string {
  const call = args as {
    messages?: Array<{
      content?: Array<{ type: string; text?: string }>;
    }>;
  };
  const parts = call.messages?.[0]?.content ?? [];
  return parts.find((part) => part.type === "text")?.text ?? "";
}

function resultWithOutput(output: unknown, finishReason = "stop") {
  return {
    experimental_output: output,
    output,
    text: JSON.stringify(output),
    finishReason,
    usage,
  };
}

function resultWithoutOutput(text: string, finishReason = "length") {
  return {
    get experimental_output(): never {
      throw new NoOutputGeneratedError({ message: "No output generated." });
    },
    get output(): never {
      throw new NoOutputGeneratedError({ message: "No output generated." });
    },
    text,
    finishReason,
    usage,
  };
}

describe("extractPdfBatch", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    ocrPdfWithDocumentAiMock.mockReset();
    isDocumentAiConfiguredMock.mockReturnValue(false);
  });

  it("parses structured output when finishReason is stop", async () => {
    const payload = batchPayload([pagePayload(1), pagePayload(2)]);
    generateTextMock.mockResolvedValueOnce(resultWithOutput(payload, "stop"));

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(2),
      pageStart: 1,
      pageEnd: 2,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("none");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.pages[0]?.transcript).toBe("text-1");
    expect(result.batchSummary).toBe("summary");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("salvages valid JSON from text when structured output is missing", async () => {
    const payload = batchPayload([pagePayload(4)]);
    generateTextMock.mockResolvedValueOnce(
      resultWithoutOutput(JSON.stringify(payload), "length")
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(1),
      pageStart: 4,
      pageEnd: 4,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("salvage");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(4);
    expect(result.pages[0]?.transcript).toBe("text-4");
  });

  it("tiles immediately when a multi-page batch overflows instead of retrying full pages", async () => {
    generateTextMock.mockImplementation(async (args) => {
      const text = userPrompt(args);
      if (/Extract pages 10-12/.test(text)) {
        return resultWithoutOutput("{truncated", "length");
      }
      const pageMatch = /half of page (\d+)/.exec(text);
      if (pageMatch) {
        return resultWithOutput(
          batchPayload([pagePayload(Number(pageMatch[1]))]),
          "stop"
        );
      }
      return resultWithoutOutput("{truncated", "length");
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(3),
      pageStart: 10,
      pageEnd: 12,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("page-tiles");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([10, 11, 12]);
    expect(
      generateTextMock.mock.calls.some((call) =>
        /Extract pages 10-10/.test(userPrompt(call[0]))
      )
    ).toBe(false);
  });

  it("returns gap pages instead of throwing when nothing is recoverable", async () => {
    generateTextMock.mockResolvedValue(resultWithoutOutput("", "length"));

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(2),
      pageStart: 22,
      pageEnd: 23,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("page-gap");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([22, 23]);
    expect(result.pages.every(isGapExtractedPage)).toBe(true);
  });

  it("remaps relative batch page numbers onto the absolute document range", async () => {
    // Model sees a 1-page slice and returns pageNumber: 1 instead of 7.
    generateTextMock.mockResolvedValueOnce(
      resultWithOutput(batchPayload([pagePayload(1, "page-seven")]), "stop")
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(1),
      pageStart: 7,
      pageEnd: 7,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(7);
    expect(result.pages[0]?.transcript).toBe("page-seven");
  });

  it("remaps a relative multi-page batch (1..N → absolute range)", async () => {
    generateTextMock.mockResolvedValueOnce(
      resultWithOutput(
        batchPayload([pagePayload(1), pagePayload(2), pagePayload(3)]),
        "stop"
      )
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(3),
      pageStart: 4,
      pageEnd: 6,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([4, 5, 6]);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a printed page number on a 1-page vision request", async () => {
    generateTextMock.mockResolvedValueOnce(
      resultWithOutput(batchPayload([pagePayload(17, "toc-page")]), "stop")
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(1),
      pageStart: 4,
      pageEnd: 4,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(4);
    expect(result.pages[0]?.transcript).toBe("toc-page");
  });

  it("retries per page when a batch skips some of its pages", async () => {
    generateTextMock
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(5)]), "stop")
      )
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(4)]), "stop")
      )
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(5)]), "stop")
      )
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(6)]), "stop")
      );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(3),
      pageStart: 4,
      pageEnd: 6,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([4, 5, 6]);
    expect(result.recovery).toBe("per-page-retry");
  });

  it("falls back to a transcript-only pass when a page is empty without overflowing", async () => {
    generateTextMock
      .mockResolvedValueOnce(resultWithoutOutput("", "stop"))
      .mockResolvedValueOnce(resultWithoutOutput("", "stop"))
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(1)]), "stop")
      )
      .mockResolvedValueOnce(resultWithoutOutput("", "stop"))
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(2)]), "stop")
      );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(2),
      pageStart: 1,
      pageEnd: 2,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("transcript-only");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
  });

  it("tiles immediately after length overflow instead of another full-page transcript", async () => {
    const fullPageTranscriptPrompts: string[] = [];
    generateTextMock.mockImplementation(async (args) => {
      const text = userPrompt(args);
      if (/Transcribe page \d+ of /.test(text)) {
        fullPageTranscriptPrompts.push(text);
      }
      if (text.includes("the top half") || text.includes("the bottom half")) {
        const pageMatch = /half of page (\d+)/.exec(text);
        const pageNumber = pageMatch ? Number(pageMatch[1]) : 1;
        return resultWithOutput(
          batchPayload([pagePayload(pageNumber, `tile-${pageNumber}`)]),
          "stop"
        );
      }
      return resultWithoutOutput("{truncated", "length");
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(1),
      pageStart: 4,
      pageEnd: 4,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(fullPageTranscriptPrompts).toEqual([]);
    expect(result.recovery).toBe("page-tiles");
    expect(result.pages[0]?.transcript).toContain("tile-4");
  });

  it("keeps recovered pages and gaps a page that never extracts", async () => {
    generateTextMock.mockImplementation(async (args) => {
      const text = userPrompt(args);
      if (/Extract pages 10-12/.test(text)) {
        return resultWithoutOutput("{truncated", "length");
      }
      if (text.includes("half of page 10")) {
        return resultWithOutput(batchPayload([pagePayload(10)]), "stop");
      }
      if (text.includes("half of page 12")) {
        return resultWithOutput(batchPayload([pagePayload(12)]), "stop");
      }
      return resultWithoutOutput("{truncated", "length");
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(3),
      pageStart: 10,
      pageEnd: 12,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([10, 11, 12]);
    expect(result.recovery).toBe("page-gap");
    expect(isGapExtractedPage(result.pages[1]!)).toBe(true);
    expect(result.pages[0]?.transcript).toContain("text-10");
    expect(result.pages[2]?.transcript).toContain("text-12");
  });

  it("merges strip transcripts after rotating and tiling a missed page", async () => {
    generateTextMock.mockImplementation(async (args) => {
      const text = userPrompt(args);
      if (text.includes("the top half of page 4")) {
        return resultWithOutput(
          batchPayload([pagePayload(4, "toc-top")]),
          "stop"
        );
      }
      if (text.includes("the bottom half of page 4")) {
        return resultWithOutput(
          batchPayload([pagePayload(17, "toc-bottom")]),
          "stop"
        );
      }
      return resultWithoutOutput("{truncated", "length");
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(1),
      pageStart: 4,
      pageEnd: 4,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("page-tiles");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.pageNumber).toBe(4);
    expect(result.pages[0]?.transcript).toContain("toc-top");
    expect(result.pages[0]?.transcript).toContain("toc-bottom");
  });
});

describe("extractPdfBatch with a text layer", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it("transcribes with the parser and asks the model only for context", async () => {
    generateTextMock.mockResolvedValueOnce(
      resultWithOutput(
        {
          pages: [insightPayload(1), insightPayload(2)],
          batchSummary: "summary",
          continuationNote: "note",
        },
        "stop"
      )
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithTextPages(2),
      pageStart: 1,
      pageEnd: 2,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.mode).toBe("text-layer");
    expect(result.recovery).toBe("none");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.pages[0]?.transcript).toContain("slice 0 line 0");
    expect(result.pages[0]?.visualInterpretation).toBe("visual-1");
    expect(generateTextMock).toHaveBeenCalledTimes(1);

    const [call] = generateTextMock.mock.calls.at(0) as [
      { maxOutputTokens: number },
    ];
    expect(call.maxOutputTokens).toBe(6_000);
  });

  it("keeps the parsed transcript when the context pass fails", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("vertex unavailable"));

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithTextPages(2),
      pageStart: 4,
      pageEnd: 5,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.mode).toBe("text-layer");
    expect(result.recovery).toBe("text-layer-only");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([4, 5]);
    expect(result.pages[0]?.transcript).toContain("slice 0 line 0");
    expect(result.pages[0]?.visualInterpretation).toBe("");
  });

  it("never retries per page, because the parser already covered every page", async () => {
    generateTextMock.mockResolvedValueOnce(
      resultWithoutOutput("{truncated", "length")
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithTextPages(3),
      pageStart: 1,
      pageEnd: 3,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages).toHaveLength(3);
    expect(result.recovery).toBe("text-layer-only");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("skips the Gemini insight pass on Enterprise OCR-sized text-layer batches", async () => {
    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithTextPages(6),
      pageStart: 1,
      pageEnd: 6,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.mode).toBe("text-layer");
    expect(result.recovery).toBe("text-layer-only");
    expect(result.pages).toHaveLength(6);
    expect(result.pages[0]?.transcript).toContain("slice 0 line 0");
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("uses the parser for pages with a text layer and vision for the rest", async () => {
    generateTextMock.mockImplementation(async (args) => {
      const text = userPrompt(args);
      if (text.includes("Describe pages 1-1")) {
        return resultWithOutput(
          {
            pages: [insightPayload(1)],
            batchSummary: "summary",
            continuationNote: "note",
          },
          "stop"
        );
      }
      if (text.includes("Describe pages 3-3")) {
        return resultWithOutput(
          {
            pages: [insightPayload(3)],
            batchSummary: "summary",
            continuationNote: "note",
          },
          "stop"
        );
      }
      if (text.includes("Extract pages 2-2")) {
        return resultWithOutput(
          batchPayload([pagePayload(2, "scan-middle")]),
          "stop"
        );
      }
      return resultWithoutOutput("{truncated", "length");
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithMixedTextPages(),
      pageStart: 1,
      pageEnd: 3,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(result.pages[0]?.transcript).toContain("alpha line 0");
    expect(result.pages[1]?.transcript).toBe("scan-middle");
    expect(result.pages[2]?.transcript).toContain("gamma line 0");
  });

  it("OCRs only the scan pages in a mixed batch", async () => {
    isDocumentAiConfiguredMock.mockReturnValue(true);
    const transcript =
      "SW-PA-1 Pattern requirement Pass Fail measured pulse width ".repeat(8);
    ocrPdfWithDocumentAiMock.mockResolvedValueOnce({
      pages: [{ pageNumber: 1, transcript, confidence: 0.91 }],
      elapsedMs: 20,
      chunks: [],
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithMixedTextPages(),
      pageStart: 1,
      pageEnd: 3,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(ocrPdfWithDocumentAiMock).toHaveBeenCalledTimes(1);
    expect(result.recovery).toBe("ocr-document-ai");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(result.pages[0]?.transcript).toContain("alpha line 0");
    expect(result.pages[1]?.transcript).toBe(transcript);
    expect(result.pages[2]?.transcript).toContain("gamma line 0");
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("uses Document AI transcripts for scans when the processor is configured", async () => {
    isDocumentAiConfiguredMock.mockReturnValue(true);
    const transcript =
      "SW-PA-1 Pattern requirement Pass Fail measured pulse width ".repeat(8);
    ocrPdfWithDocumentAiMock.mockResolvedValueOnce({
      pages: [
        { pageNumber: 1, transcript, confidence: 0.92 },
        { pageNumber: 2, transcript, confidence: 0.88 },
      ],
      elapsedMs: 40,
      chunks: [],
    });

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(2),
      pageStart: 10,
      pageEnd: 11,
      filename: "scan.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("ocr-document-ai");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([10, 11]);
    expect(result.pages[0]?.transcript).toBe(transcript);
    expect(result.pages[0]?.pageContext).toContain("SW-PA-1");
    expect(result.batchSummary).toContain("SW-PA-1");
    expect(result.batchSummary).not.toMatch(/^Page 10 Page 11$/);
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("sends weak OCR pages to Gemini vision", async () => {
    isDocumentAiConfiguredMock.mockReturnValue(true);
    const strong =
      "SW-PA-1 Pattern requirement Pass Fail measured pulse width ".repeat(8);
    ocrPdfWithDocumentAiMock.mockResolvedValueOnce({
      pages: [
        { pageNumber: 1, transcript: "hi", confidence: 0.2 },
        { pageNumber: 2, transcript: strong, confidence: 0.9 },
      ],
      elapsedMs: 40,
      chunks: [],
    });
    generateTextMock.mockResolvedValueOnce(
      resultWithOutput(batchPayload([pagePayload(1, "vision-fallback")]), "stop")
    );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(2),
      pageStart: 1,
      pageEnd: 2,
      filename: "scan.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.pages[0]?.transcript).toBe("vision-fallback");
    expect(result.pages[1]?.transcript).toBe(strong);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});

describe("remapExtractedPageNumbers", () => {
  it("prefers absolute page numbers when present", () => {
    const pages = remapExtractedPageNumbers(
      [pagePayload(4), pagePayload(5)],
      4,
      6
    );
    expect(pages.map((page) => page.pageNumber)).toEqual([4, 5]);
  });

  it("merges absolute numbers with relative 1-based indices", () => {
    const pages = remapExtractedPageNumbers(
      [pagePayload(4, "abs-4"), pagePayload(2, "rel-2"), pagePayload(3, "rel-3")],
      4,
      6
    );
    expect(pages.map((page) => page.pageNumber)).toEqual([4, 5, 6]);
    expect(pages.map((page) => page.transcript)).toEqual([
      "abs-4",
      "rel-2",
      "rel-3",
    ]);
  });

  it("falls back to relative 1-based indices for sliced batches", () => {
    const pages = remapExtractedPageNumbers([pagePayload(1)], 7, 7);
    expect(pages.map((page) => page.pageNumber)).toEqual([7]);
  });

  it("accepts a single returned page even when the printed number is wrong", () => {
    const pages = remapExtractedPageNumbers([pagePayload(17, "toc")], 4, 4);
    expect(pages.map((page) => page.pageNumber)).toEqual([4]);
    expect(pages[0]?.transcript).toBe("toc");
  });

  it("returns empty when page numbers match neither absolute nor relative", () => {
    expect(remapExtractedPageNumbers([pagePayload(99)], 4, 6)).toEqual([]);
  });
});

describe("gap extracted pages", () => {
  it("names the missing page and reports a warning", () => {
    const gap = gapExtractedPage(4);
    expect(isGapExtractedPage(gap)).toBe(true);
    expect(extractionWarningForGaps([pagePayload(1), gap])).toBe(
      "Could not fully index page(s) 4. Search still works for the rest."
    );
    expect(extractionWarningForGaps([pagePayload(1)])).toBeNull();
  });
});

describe("resolveDocumentExtractLocation", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("defaults to global", () => {
    delete process.env.DOCUMENT_EXTRACT_LOCATION;
    expect(resolveDocumentExtractLocation()).toBe("global");
  });

  it("honors an explicit override and never reads GOOGLE_VERTEX_LOCATION", () => {
    process.env.DOCUMENT_EXTRACT_LOCATION = "europe-west1";
    process.env.GOOGLE_VERTEX_LOCATION = "us-central1";
    expect(resolveDocumentExtractLocation()).toBe("europe-west1");
  });
});
