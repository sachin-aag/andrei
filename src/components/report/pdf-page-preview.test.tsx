// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";
import { PDF_PREVIEW_SCALE } from "@/lib/attachments/pdf-preview-layout";

const renderPageAsImage = vi.fn();
const getDocumentProxy = vi.fn();

vi.mock("unpdf", () => ({
  renderPageAsImage: (...args: unknown[]) => renderPageAsImage(...args),
  getDocumentProxy: (...args: unknown[]) => getDocumentProxy(...args),
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
  };
}

describe("PdfPagePreview", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    renderPageAsImage.mockReset();
    getDocumentProxy.mockReset();
    renderPageAsImage.mockResolvedValue("data:image/png;base64,abc");
    getDocumentProxy.mockResolvedValue({
      getPage: async () => mockPdfPage(),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches the same-origin PDF, paints the page, and overlays selectable text", async () => {
    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=2#page=2"
        page={2}
        title="Evidence.pdf"
      />
    );

    expect(screen.getByText("Loading preview…")).toBeInTheDocument();

    const image = await screen.findByAltText("Evidence.pdf, page 2");
    expect(image).toHaveAttribute("src", "data:image/png;base64,abc");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/reports/r1/attachments/a1/content?proxy=1",
      expect.objectContaining({ credentials: "same-origin" })
    );
    await waitFor(() => {
      expect(renderPageAsImage).toHaveBeenCalledWith(
        expect.anything(),
        2,
        expect.objectContaining({ toDataURL: true, scale: PDF_PREVIEW_SCALE })
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

    getDocumentProxy.mockResolvedValue({
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

  it("still paints the image when the PDF has no text layer", async () => {
    getDocumentProxy.mockResolvedValue({
      getPage: async () => mockPdfPage({ items: [] }),
    });

    render(
      <PdfPagePreview
        src="/api/reports/r1/attachments/a1/content?proxy=1&page=1"
        page={1}
        title="Scan.pdf"
      />
    );

    expect(await screen.findByAltText("Scan.pdf, page 1")).toBeInTheDocument();
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
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
