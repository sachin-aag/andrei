// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import { pdfjsPreviewLoadingOptions } from "@/lib/attachments/pdfjs-browser";
import { PDF_PREVIEW_SCALE } from "@/lib/attachments/pdf-preview-layout";

const getDocument = vi.fn();
const renderPage = vi.fn();
const getPage = vi.fn();

vi.mock("pdfjs-dist", () => ({
  version: "6.1.200",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
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
    getViewport: ({
      scale,
      rotation = 0,
    }: {
      scale: number;
      rotation?: number;
    }) => ({
      width: (overrides.width ?? 200) * scale,
      height: (overrides.height ?? 400) * scale,
      rotation,
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
    // pdf.js owns the transfer. A direct fetch here means the component went
    // back to buffering the file on the main thread before parsing.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("preview must not fetch bytes itself"))
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
      // One streamed GET of the page-less content URL. Range loading made
      // pdf.js fall back to fetching every chunk — see pdfjs-browser.ts.
      expect(getDocument).toHaveBeenCalledWith({
        url: "/api/reports/r1/attachments/a1/content?proxy=1",
        ...pdfjsPreviewLoadingOptions("6.1.200"),
      });
      expect(getDocument.mock.calls[0]?.[0]).not.toHaveProperty("range");
      expect(getDocument.mock.calls[0]?.[0]).not.toHaveProperty("data");
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
      expect(screen.getByLabelText("Scan.pdf, page 1")).not.toHaveClass(
        "hidden"
      );
    });
    expect(screen.queryByText("Loading preview…")).not.toBeInTheDocument();
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

  it("reports transfer progress while a large file downloads", async () => {
    let resolveDocument: (pdf: unknown) => void = () => {};
    const task: { promise: Promise<unknown>; onProgress?: unknown; destroy: unknown } = {
      promise: new Promise((resolve) => {
        resolveDocument = resolve;
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    getDocument.mockReturnValue(task);

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Huge.pdf"
        sizeBytes={130_000_000}
      />
    );

    await waitFor(() => {
      expect(task.onProgress).toBeTypeOf("function");
    });
    (task.onProgress as (p: { loaded: number; total: number }) => void)({
      loaded: 65_000_000,
      total: 130_000_000,
    });

    expect(
      await screen.findByText("Loading preview… 50% of 130.0 MB")
    ).toBeInTheDocument();

    resolveDocument({ numPages: 1, getPage });
    await screen.findByLabelText("Huge.pdf, page 1");
  });

  it("releases the canvas of pages that scroll out of the window", async () => {
    const observers: {
      callback: IntersectionObserverCallback;
      targets: Element[];
      rootMargin: string;
    }[] = [];
    class TrackingIntersectionObserver {
      readonly entry: {
        callback: IntersectionObserverCallback;
        targets: Element[];
        rootMargin: string;
      };
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit
      ) {
        this.entry = {
          callback,
          targets: [],
          rootMargin: options?.rootMargin ?? "0px",
        };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
        this.entry.callback(
          [{ isIntersecting: true, intersectionRatio: 1, target }] as never,
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
    vi.stubGlobal("IntersectionObserver", TrackingIntersectionObserver);

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    const pageTwo = await screen.findByLabelText("Evidence.pdf, page 2");
    await waitFor(() => expect(pageTwo).not.toHaveClass("hidden"));
    expect((pageTwo as HTMLCanvasElement).width).toBeGreaterThan(0);

    // Scroll page 2 far out of view. Only the prefetch observer (the one with
    // the lookahead margin) drives the render window.
    const prefetchObserver = observers.find(
      (entry) => entry.rootMargin === "800px 0px"
    );
    const target = prefetchObserver?.targets.find(
      (node) => (node as HTMLElement).dataset.pdfPage === "2"
    );
    prefetchObserver?.callback(
      [{ isIntersecting: false, intersectionRatio: 0, target }] as never,
      null as unknown as IntersectionObserver
    );

    await waitFor(() => {
      expect((pageTwo as HTMLCanvasElement).width).toBe(0);
      expect(pageTwo).toHaveClass("hidden");
    });
    // The requested page always keeps its canvas.
    expect(screen.getByLabelText("Evidence.pdf, page 1")).not.toHaveClass(
      "hidden"
    );
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

  it("renders page navigation, rotate, and zoom controls", async () => {
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    await screen.findByLabelText("Evidence.pdf, page 1");
    expect(screen.getByTestId("pdf-preview-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-toolbar-page-input")).toHaveValue("1");
    expect(screen.getByText("of 2")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-toolbar-rotate")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-toolbar-zoom-in")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-toolbar-zoom-out")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("jumps to a page when the user enters a page number", async () => {
    const onVisiblePageChange = vi.fn();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

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
    const input = screen.getByTestId("pdf-toolbar-page-input");
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
    expect(onVisiblePageChange).toHaveBeenCalledWith(2);
  });

  it("re-renders with a higher scale when zooming in", async () => {
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    await screen.findByLabelText("Evidence.pdf, page 1");
    fireEvent.click(screen.getByTestId("pdf-toolbar-zoom-in"));

    await waitFor(() => {
      expect(renderPage).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: expect.objectContaining({
            width: 200 * PDF_PREVIEW_SCALE * 1.25,
          }),
        })
      );
    });
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("re-renders with rotation when the rotate button is clicked", async () => {
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
        sizeBytes={250_000}
      />
    );

    await screen.findByLabelText("Evidence.pdf, page 1");
    fireEvent.click(screen.getByTestId("pdf-toolbar-rotate"));

    await waitFor(() => {
      expect(getPage).toHaveBeenCalled();
      const lastRender = renderPage.mock.calls.at(-1)?.[0] as {
        viewport?: { rotation?: number };
      };
      expect(lastRender?.viewport).toEqual(
        expect.objectContaining({ rotation: 90 })
      );
    });
  });
});
