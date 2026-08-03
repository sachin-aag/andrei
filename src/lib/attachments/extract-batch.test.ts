import { PDFDocument } from "pdf-lib";
import { NoOutputGeneratedError, type LanguageModel } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

import { extractPdfBatch } from "./extract-batch";

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

async function pdfWithPages(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage();
  }
  return Buffer.from(await document.save());
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
});
