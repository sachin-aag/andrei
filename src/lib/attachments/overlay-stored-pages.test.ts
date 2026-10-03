import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewPageSource } from "@/lib/ai/chat/document-review";

const {
  overlayNumericSignsOnPdfPagesMock,
  readObjectBufferMock,
  selectLimitMock,
  updateWhereMock,
  isTestStubChatMock,
  isTestStubDocumentIngestMock,
} = vi.hoisted(() => ({
  overlayNumericSignsOnPdfPagesMock: vi.fn(),
  readObjectBufferMock: vi.fn(),
  selectLimitMock: vi.fn(),
  updateWhereMock: vi.fn(),
  isTestStubChatMock: vi.fn(() => false),
  isTestStubDocumentIngestMock: vi.fn(() => false),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => selectLimitMock(...args),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: (...args: unknown[]) => updateWhereMock(...args),
      }),
    }),
  },
}));

vi.mock("@/lib/attachments/extract-batch", () => ({
  DEFAULT_DOCUMENT_EXTRACT_MODEL_ID: "gemini-3.1-flash-lite",
  overlayNumericSignsOnPdfPages: (...args: unknown[]) =>
    overlayNumericSignsOnPdfPagesMock(...args),
}));

vi.mock("@/lib/storage/attachments", () => ({
  getAttachmentStorage: () => ({
    readObjectBuffer: (...args: unknown[]) => readObjectBufferMock(...args),
  }),
}));

vi.mock("@/lib/test/ai-bypass", () => ({
  isTestStubChat: () => isTestStubChatMock(),
  isTestStubDocumentIngest: () => isTestStubDocumentIngestMock(),
}));

import { overlayNumericSignsOnReviewPages } from "./overlay-stored-pages";

function reviewPage(
  transcript: string,
  visual = ""
): ReviewPageSource {
  return {
    attachmentId: "att_urs",
    filename: "URS.pdf",
    pageNumber: 6,
    transcript,
    pageContext: null,
    printedPageLabel: "6",
    ingestRunId: "run_1",
    visualInterpretation: visual,
  };
}

const attachmentRow = {
  id: "att_urs",
  reportId: "rep_1",
  filename: "URS.pdf",
  mimeType: "application/pdf",
  deletedAt: null,
  assetId: null,
  activeIngestRunId: "run_1",
  permanentObjectKey: "attachments/att_urs/source.pdf",
  stagingObjectKey: "",
  gcsGeneration: "1",
  crc32c: null,
  sha256: "abc",
  sizeBytes: 10,
  processingStatus: "ready",
};

describe("overlayNumericSignsOnReviewPages", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, GOOGLE_VERTEX_PROJECT: "test-project" };
    overlayNumericSignsOnPdfPagesMock.mockReset();
    readObjectBufferMock.mockReset();
    selectLimitMock.mockReset();
    updateWhereMock.mockReset();
    isTestStubChatMock.mockReturnValue(false);
    isTestStubDocumentIngestMock.mockReturnValue(false);
    updateWhereMock.mockResolvedValue(undefined);
    readObjectBufferMock.mockResolvedValue(Buffer.from("pdf"));
    selectLimitMock.mockResolvedValue([attachmentRow]);
  });

  afterEach(() => {
    process.env = env;
  });

  it("does not call Gemini when chat is stubbed", async () => {
    isTestStubChatMock.mockReturnValue(true);
    const pages = [reviewPage("URS-3\n15 °C to 130 °C")];
    await expect(
      overlayNumericSignsOnReviewPages({ reportId: "rep_1", pages })
    ).resolves.toEqual(pages);
    expect(overlayNumericSignsOnPdfPagesMock).not.toHaveBeenCalled();
  });

  it("copies a recovered minus onto stored pages and persists it", async () => {
    overlayNumericSignsOnPdfPagesMock.mockResolvedValue({
      pages: [
        {
          pageNumber: 6,
          transcript: "URS-3\n-15 °C to 130 °C",
          visualInterpretation: "numeric-sign-look: −15 °C to 130 °C",
        },
      ],
    });
    const pages = [reviewPage("URS-3\n15 °C to 130 °C")];
    const next = await overlayNumericSignsOnReviewPages({
      reportId: "rep_1",
      pages,
    });
    expect(overlayNumericSignsOnPdfPagesMock).toHaveBeenCalledTimes(1);
    expect(next[0]?.transcript).toContain("-15 °C to 130 °C");
    expect(updateWhereMock).toHaveBeenCalled();
  });

  it("skips a second look after the overlay stamp", async () => {
    const pages = [
      reviewPage(
        "URS-3\n15 °C to 130 °C",
        "numeric-sign-look: none"
      ),
    ];
    await overlayNumericSignsOnReviewPages({ reportId: "rep_1", pages });
    expect(overlayNumericSignsOnPdfPagesMock).not.toHaveBeenCalled();
    expect(updateWhereMock).not.toHaveBeenCalled();
  });
});
