import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listReadyDocumentsForReportMock,
  readDocumentPageMock,
  listActiveAttachmentsMock,
  readObjectBufferMock,
  compressRasterToDataUrlMock,
  renderPdfPagePngMock,
  dbSelectMock,
} = vi.hoisted(() => ({
  listReadyDocumentsForReportMock: vi.fn(),
  readDocumentPageMock: vi.fn(),
  listActiveAttachmentsMock: vi.fn(),
  readObjectBufferMock: vi.fn(),
  compressRasterToDataUrlMock: vi.fn(),
  renderPdfPagePngMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => dbSelectMock(...args),
  },
}));

vi.mock("@/lib/attachments/retrieval", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/attachments/retrieval")>();
  return {
    ...actual,
    listReadyDocumentsForReport: (...args: unknown[]) =>
      listReadyDocumentsForReportMock(...(args as [])),
    readDocumentPage: (...args: unknown[]) =>
      readDocumentPageMock(...(args as [])),
  };
});

vi.mock("@/lib/attachments/list-active", () => ({
  listActiveAttachments: (...args: unknown[]) =>
    listActiveAttachmentsMock(...(args as [])),
}));

vi.mock("@/lib/storage/attachments", () => ({
  getAttachmentStorage: () => ({
    readObjectBuffer: (...args: unknown[]) =>
      readObjectBufferMock(...(args as [])),
  }),
}));

vi.mock("@/lib/images/compress-raster", () => ({
  compressRasterToDataUrl: (...args: unknown[]) =>
    compressRasterToDataUrlMock(...(args as [])),
}));

vi.mock("@/lib/attachments/pdf-page-image", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/attachments/pdf-page-image")>();
  return {
    ...actual,
    renderPdfPagePng: (...args: unknown[]) =>
      renderPdfPagePngMock(...(args as [])),
  };
});

import { loadDocumentFigure } from "./load-document-figure";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const DATA_URL = `data:image/png;base64,${TINY_PNG.toString("base64")}`;

function mockAttachmentSelect(row: Record<string, unknown> | null) {
  dbSelectMock.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
  }));
}

describe("loadDocumentFigure", () => {
  beforeEach(() => {
    listReadyDocumentsForReportMock.mockReset();
    readDocumentPageMock.mockReset();
    listActiveAttachmentsMock.mockReset();
    readObjectBufferMock.mockReset();
    compressRasterToDataUrlMock.mockReset();
    renderPdfPagePngMock.mockReset();
    dbSelectMock.mockReset();
    listReadyDocumentsForReportMock.mockResolvedValue([]);
    listActiveAttachmentsMock.mockResolvedValue([]);
    compressRasterToDataUrlMock.mockResolvedValue({
      dataUrl: DATA_URL,
      width: 800,
      height: 600,
      mimeType: "image/png",
    });
  });

  it("asks for a filename when it is blank", async () => {
    const result = await loadDocumentFigure({
      reportId: "report-1",
      filename: "  ",
      page: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("image_not_found");
    expect(result.message).toContain("filename");
  });

  it("points at list_attachments when the file is not ready", async () => {
    const result = await loadDocumentFigure({
      reportId: "report-1",
      filename: "protocol.docx",
      page: 12,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("No ready attachment");
  });

  it("says the file is still ingesting when it is not ready yet", async () => {
    listActiveAttachmentsMock.mockResolvedValue([
      {
        id: "att_1",
        filename: "protocol.docx",
        processingStatus: "processing",
      },
    ]);
    const result = await loadDocumentFigure({
      reportId: "report-1",
      filename: "protocol.docx",
      page: 12,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("still ingesting");
  });

  it("rasters a PDF page into a suggestion image", async () => {
    listReadyDocumentsForReportMock.mockResolvedValue([
      {
        attachmentId: "att_pdf",
        filename: "protocol.pdf",
        description: null,
        pageCount: 4,
        ingestRunId: "run_1",
        documentSummary: null,
      },
    ]);
    readDocumentPageMock.mockResolvedValue({
      attachmentId: "att_pdf",
      filename: "protocol.pdf",
      description: null,
      pageNumber: 3,
      printedPageLabel: "3",
      transcript: "Vessel sketch",
      visualInterpretation: "PFR drawing of ISM Stage-4.",
      pageContext: null,
      ingestRunId: "run_1",
    });
    mockAttachmentSelect({
      id: "att_pdf",
      reportId: "report-1",
      filename: "protocol.pdf",
      mimeType: "application/pdf",
      assetId: null,
      deletedAt: null,
      pageCount: 4,
      permanentObjectKey: "attachments/att_pdf/source.pdf",
      stagingObjectKey: "",
      gcsGeneration: "1",
      crc32c: "",
      sha256: "",
      sizeBytes: 12,
      processingStatus: "ready",
      activeIngestRunId: "run_1",
    });
    readObjectBufferMock.mockResolvedValue(Buffer.from("%PDF"));
    renderPdfPagePngMock.mockResolvedValue(TINY_PNG);

    const result = await loadDocumentFigure({
      reportId: "report-1",
      filename: "protocol.pdf",
      page: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachmentId).toBe("att_pdf");
    expect(result.page).toBe(3);
    expect(result.image.src).toBe(DATA_URL);
    expect(result.image.alt).toContain("PFR drawing");
    expect(renderPdfPagePngMock).toHaveBeenCalledWith(
      expect.any(Buffer),
      3,
      1.5
    );
  });

  it("refuses a tagged-out file", async () => {
    listReadyDocumentsForReportMock.mockResolvedValue([
      {
        attachmentId: "att_other",
        filename: "protocol.pdf",
        description: null,
        pageCount: 4,
        ingestRunId: "run_1",
        documentSummary: null,
      },
    ]);
    const result = await loadDocumentFigure({
      reportId: "report-1",
      filename: "protocol.pdf",
      page: 3,
      allowedAttachmentIds: ["att_tagged"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("attachment_out_of_scope");
  });
});
