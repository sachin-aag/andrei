// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import { pdfjsPreviewDocumentOptions } from "@/lib/attachments/pdfjs-browser";
import { PDF_PREVIEW_SCALE } from "@/lib/attachments/pdf-preview-layout";

const getDocument = vi.fn();
const renderPage = vi.fn();

vi.mock("pdfjs-dist", () => ({
  version: "6.1.200",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

function mockPdfPage(overrides: {
  width?: number;
  height?: number;
  items?: unknown[];
  styles?: Record<string, { fontFamily?: string; ascent?: number }>;
} = {}) {
  return {
    getViewport: ({ scale }: { scale: number }) => ({
      width: (overrides.width ?? 200) * scale,
      height: (overrides.height ?? 400) * scale,
    }),
    getTextContent: async () => ({
      styles: overrides.styles ?? { F1: { fontFamily: "Times", ascent: 0.8 } },
      items: overrides.items ?? [
        {
          str: "Batch 123",
          transform: [12, 0, 0, 12, 10, 380],
          width: 80,
          height: 12,
          fontName: "F1",
          dir: "ltr",
          hasEOL: false,
        },
      ],
    }),
    render: (...args: unknown[]) => renderPage(...args),
  };
}

describe("PdfPagePreview", () => {
  const originalFetch = globalThis.fetch;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    getDocument.mockReset();
    renderPage.mockReset();
    renderPage.mockReturnValue({ promise: Promise.resolve() });
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getPage: async () => mockPdfPage(),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      canvas: {},
    }) as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it("fetches the PDF and paints it with official pdf.js wasm/fonts", async () => {
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2#page=2"
        page={2}
        title="Evidence.pdf"
      />
    );

    expect(screen.getByText("Loading preview…")).toBeInTheDocument();

    const canvas = await screen.findByLabelText("Evidence.pdf, page 2");
    expect(canvas.tagName).toBe("CANVAS");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/reports/r1/attachments/a1/content?proxy=1",
      expect.objectContaining({ credentials: "same-origin" })
    );
    await waitFor(() => {
      expect(getDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          ...pdfjsPreviewDocumentOptions("6.1.200"),
          data: expect.any(Uint8Array),
        })
      );
      expect(renderPage).toHaveBeenCalledWith(
        expect.objectContaining({
          viewport: expect.objectContaining({
            width: 200 * PDF_PREVIEW_SCALE,
          }),
        })
      );
    });

    const text = await screen.findByText("Batch 123");
    expect(text.tagName).toBe("SPAN");
    expect(text.parentElement).toHaveClass("pdf-page-preview-text-layer");
  });

  it("reuses the fetched PDF bytes when the page changes", async () => {
    const { rerender } = render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
      />
    );
    await screen.findByText("Batch 123");

    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getPage: async () =>
          mockPdfPage({
            items: [
              {
                str: "Page two",
                transform: [12, 0, 0, 12, 10, 200],
                width: 40,
                height: 12,
                fontName: "F1",
              },
            ],
          }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    rerender(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2"
        page={2}
        title="Evidence.pdf"
      />
    );

    expect(await screen.findByText("Page two")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("still paints the canvas when the PDF has no text layer", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        getPage: async () => mockPdfPage({ items: [] }),
      }),
      destroy: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Scan.pdf"
      />
    );

    await waitFor(() => {
      expect(renderPage).toHaveBeenCalled();
    });
    expect(screen.queryByText("Loading preview…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Scan.pdf, page 1")).toBeInTheDocument();
    expect(screen.queryByText("Batch 123")).not.toBeInTheDocument();
  });

  it("shows a download hint when the fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
    }) as typeof fetch;

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Evidence.pdf"
      />
    );

    expect(
      await screen.findByText(/Could not render this page in the browser/)
    ).toBeInTheDocument();
  });
});
