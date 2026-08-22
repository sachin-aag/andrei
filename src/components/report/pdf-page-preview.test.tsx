// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import { pdfjsPreviewLoadingOptions } from "@/lib/attachments/pdfjs-browser";
import { PDF_PREVIEW_SCALE } from "@/lib/attachments/pdf-preview-layout";

const getDocument = vi.fn();
const renderPage = vi.fn();
const getPage = vi.fn();

class MockPDFDataRangeTransport {
  length: number;
  initialData: Uint8Array | null;
  constructor(length: number, initialData: Uint8Array | null) {
    this.length = length;
    this.initialData = initialData;
  }
  onDataRange(): void {}
  requestDataRange(): void {}
  abort(): void {}
}

vi.mock("pdfjs-dist", () => ({
  version: "6.1.200",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
  PDFDataRangeTransport: MockPDFDataRangeTransport,
}));

function mockPdfPage(
  pageNumber: number,
  overrides: {
    width?: number;
    height?: number;
    items?: unknown[];
    styles?: Record<string, { fontFamily?: string; ascent?: number }>;
    getTextContent?: () => Promise<unknown>;
  } = {}
) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: (overrides.width ?? 200) * scale,
      height: (overrides.height ?? 400) * scale,
    }),
    getTextContent:
      overrides.getTextContent ??
      (async () => ({
        styles: overrides.styles ?? { F1: { fontFamily: "Times", ascent: 0.8 } },
        items: overrides.items ?? [
          {
            str: `Batch page ${pageNumber}`,
            transform: [12, 0, 0, 12, 10, 380],
            width: 80,
            height: 12,
            fontName: "F1",
            dir: "ltr",
            hasEOL: false,
          },
        ],
      })),
    render: (...args: unknown[]) => renderPage(...args),
  };
}

function installImmediateIntersectionObserver() {
  class ImmediateIntersectionObserver {
    readonly callback: IntersectionObserverCallback;

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      this.callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          },
        ],
        this as unknown as IntersectionObserver
      );
    }

    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
  }

  vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);
}

function installNoopIntersectionObserver() {
  class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
  }

  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
}

describe("PdfPagePreview", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    getDocument.mockReset();
    renderPage.mockReset();
    getPage.mockReset();
    renderPage.mockReturnValue({ promise: Promise.resolve() });
    getPage.mockImplementation(async (pageNumber: number) =>
      mockPdfPage(pageNumber)
    );
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage,
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      canvas: {},
    }) as typeof HTMLCanvasElement.prototype.getContext;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("preview tests must pass sizeBytes"))
    );
    installImmediateIntersectionObserver();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.unstubAllGlobals();
  });

  it("loads the PDF from the content URL and paints every page with official pdf.js", async () => {
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2#page=2"
        page={2}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    expect(screen.getByText("Loading preview…")).toBeInTheDocument();

    const pageOne = await screen.findByLabelText("Evidence.pdf, page 1");
    const pageTwo = await screen.findByLabelText("Evidence.pdf, page 2");
    expect(pageOne.tagName).toBe("CANVAS");
    expect(pageTwo.tagName).toBe("CANVAS");
    await waitFor(() => {
      expect(getDocument).toHaveBeenCalledTimes(1);
      expect(getDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          range: expect.any(MockPDFDataRangeTransport),
          ...pdfjsPreviewLoadingOptions("6.1.200"),
        })
      );
      expect(getDocument.mock.calls[0]?.[0]).not.toHaveProperty("url");
      expect(getDocument.mock.calls[0]?.[0]).not.toHaveProperty("data");
      expect(
        (getDocument.mock.calls[0]?.[0] as { range: MockPDFDataRangeTransport })
          .range.length
      ).toBe(250_000);
      expect(renderPage).toHaveBeenCalledTimes(2);
      expect(renderPage).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: expect.objectContaining({
            width: 200 * PDF_PREVIEW_SCALE,
          }),
        })
      );
    });

    expect(await screen.findByText("Batch page 1")).toBeInTheDocument();
    expect(await screen.findByText("Batch page 2")).toBeInTheDocument();
    expect(screen.getByText("Batch page 1").parentElement).toHaveClass(
      "pdf-page-preview-text-layer"
    );
    expect(screen.getByLabelText("Evidence.pdf preview")).toHaveAttribute(
      "data-pdf-preview-scroll"
    );
  });

  it("does not reload the document when the requested page changes", async () => {
    const { rerender } = render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );
    await screen.findByText("Batch page 2");

    rerender(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2"
        page={2}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    expect(await screen.findByText("Batch page 2")).toBeInTheDocument();
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it("shows the canvas before the text layer is ready", async () => {
    getPage.mockImplementation(async (pageNumber: number) =>
      mockPdfPage(pageNumber, {
        getTextContent: () => new Promise(() => {}),
      })
    );
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage,
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Scan.pdf"
        sizeBytes={250_000}
      />
    );

    const canvas = await screen.findByLabelText("Scan.pdf, page 1");
    await waitFor(() => {
      expect(renderPage).toHaveBeenCalled();
      expect(canvas).not.toHaveClass("hidden");
    });
    expect(screen.queryByText("Batch page 1")).not.toBeInTheDocument();
  });

  it("paints the requested page without waiting for IntersectionObserver", async () => {
    installNoopIntersectionObserver();

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2"
        page={2}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    const pageTwo = await screen.findByLabelText("Evidence.pdf, page 2");
    await waitFor(() => {
      expect(pageTwo).not.toHaveClass("hidden");
    });
    expect(screen.getByLabelText("Evidence.pdf, page 1")).toHaveClass("hidden");
    expect(renderPage).toHaveBeenCalledTimes(1);
  });

  it("still paints the canvas when the PDF has no text layer", async () => {
    getPage.mockImplementation(async (pageNumber: number) =>
      mockPdfPage(pageNumber, { items: [] })
    );
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage,
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Scan.pdf"
        sizeBytes={250_000}
      />
    );

    await waitFor(() => {
      expect(renderPage).toHaveBeenCalled();
    });
    expect(screen.queryByText("Loading preview…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scan.pdf, page 1")).not.toHaveClass("hidden");
    expect(screen.queryByText("Batch page 1")).not.toBeInTheDocument();
  });

  it("reports the page currently in view", async () => {
    const onVisiblePageChange = vi.fn();
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
        onVisiblePageChange={onVisiblePageChange}
      />
    );

    await screen.findByLabelText("Evidence.pdf, page 2");
    await waitFor(() => {
      expect(onVisiblePageChange).toHaveBeenCalled();
    });
    const lastPage = onVisiblePageChange.mock.calls.at(-1)?.[0];
    expect(lastPage === 1 || lastPage === 2).toBe(true);
  });

  it("does not prefetch neighbors until the requested page has painted", async () => {
    let releaseRequestedPage = () => {};
    const requestedPageReady = new Promise<void>((resolve) => {
      releaseRequestedPage = resolve;
    });
    getPage.mockImplementation(async (pageNumber: number) => {
      if (pageNumber === 2) await requestedPageReady;
      return mockPdfPage(pageNumber);
    });

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2"
        page={2}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    await waitFor(() => {
      expect(getPage).toHaveBeenCalledWith(2);
    });
    expect(getPage).not.toHaveBeenCalledWith(1);
    expect(renderPage).not.toHaveBeenCalled();

    releaseRequestedPage();

    await waitFor(() => {
      expect(getPage).toHaveBeenCalledWith(1);
      expect(renderPage).toHaveBeenCalledTimes(2);
    });
  });

  it("shows a download hint when pdf.js cannot open the file", async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error("Preview fetch failed (502)")),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    expect(
      await screen.findByText(/Could not render this page in the browser/)
    ).toBeInTheDocument();
  });
});
