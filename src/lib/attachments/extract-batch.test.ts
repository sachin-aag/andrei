import { PDFDocument, StandardFonts } from "pdf-lib";
import { NoOutputGeneratedError, type LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

import {
  extractPdfBatch,
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

  it("retries per page when a multi-page batch yields no usable output", async () => {
    generateTextMock
      .mockResolvedValueOnce(resultWithoutOutput("{truncated", "length"))
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(10)]), "stop")
      )
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(11)]), "stop")
      )
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(12)]), "stop")
      );

    const result = await extractPdfBatch({
      pdfBuffer: await pdfWithPages(3),
      pageStart: 10,
      pageEnd: 12,
      filename: "evidence.pdf",
      modelId: "stub",
      model: stubModel(),
    });

    expect(result.recovery).toBe("per-page-retry");
    expect(result.pages.map((page) => page.pageNumber)).toEqual([10, 11, 12]);
    expect(generateTextMock).toHaveBeenCalledTimes(4);
  });

  it("throws a page-range-specific error when nothing is recoverable", async () => {
    generateTextMock.mockResolvedValue(resultWithoutOutput("", "length"));

    await expect(
      extractPdfBatch({
        pdfBuffer: await pdfWithPages(2),
        pageStart: 22,
        pageEnd: 23,
        filename: "evidence.pdf",
        modelId: "stub",
        model: stubModel(),
      })
    ).rejects.toThrow("PDF extraction produced no output for pages 22-23");
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

  it("falls back to a transcript-only pass when a page overflows the schema", async () => {
    generateTextMock
      .mockResolvedValueOnce(resultWithoutOutput("{truncated", "length"))
      .mockResolvedValueOnce(resultWithoutOutput("{truncated", "length"))
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(1)]), "stop")
      )
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

  it("fails the batch instead of dropping a page that never recovers", async () => {
    generateTextMock
      .mockResolvedValueOnce(resultWithoutOutput("{truncated", "length"))
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(10)]), "stop")
      )
      .mockResolvedValueOnce(resultWithoutOutput("{truncated", "length"))
      .mockResolvedValueOnce(resultWithoutOutput("{truncated", "length"))
      .mockResolvedValueOnce(
        resultWithOutput(batchPayload([pagePayload(12)]), "stop")
      );

    await expect(
      extractPdfBatch({
        pdfBuffer: await pdfWithPages(3),
        pageStart: 10,
        pageEnd: 12,
        filename: "evidence.pdf",
        modelId: "stub",
        model: stubModel(),
      })
    ).rejects.toThrow("PDF extraction is incomplete: no output for page(s) 11");
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

  it("falls back to relative 1-based indices for sliced batches", () => {
    const pages = remapExtractedPageNumbers([pagePayload(1)], 7, 7);
    expect(pages.map((page) => page.pageNumber)).toEqual([7]);
  });

  it("returns empty when page numbers match neither absolute nor relative", () => {
    expect(remapExtractedPageNumbers([pagePayload(99)], 4, 6)).toEqual([]);
  });
});

describe("resolveDocumentExtractLocation", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("defaults to global even when GOOGLE_VERTEX_LOCATION is us-central1", () => {
    delete process.env.DOCUMENT_EXTRACT_LOCATION;
    process.env.GOOGLE_VERTEX_LOCATION = "us-central1";
    expect(resolveDocumentExtractLocation()).toBe("global");
  });

  it("honors an explicit DOCUMENT_EXTRACT_LOCATION override", () => {
    process.env.DOCUMENT_EXTRACT_LOCATION = "europe-west1";
    process.env.GOOGLE_VERTEX_LOCATION = "us-central1";
    expect(resolveDocumentExtractLocation()).toBe("europe-west1");
  });
});
