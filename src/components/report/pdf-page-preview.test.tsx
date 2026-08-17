// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPagePreview } from "@/components/report/pdf-page-preview";

const renderPageAsImage = vi.fn();

vi.mock("unpdf", () => ({
  renderPageAsImage: (...args: unknown[]) => renderPageAsImage(...args),
}));

describe("PdfPagePreview", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    renderPageAsImage.mockReset();
    renderPageAsImage.mockResolvedValue("data:image/png;base64,abc");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches the same-origin PDF and paints the requested page as an image", async () => {
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
      "/api/reports/r1/attachments/a1/content?proxy=1&page=2",
      expect.objectContaining({ credentials: "same-origin" })
    );
    await waitFor(() => {
      expect(renderPageAsImage).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        2,
        expect.objectContaining({ toDataURL: true })
      );
    });
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
