import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPdfPreviewRangeTransport,
  fetchPdfByteRange,
  knownPdfByteLength,
  parseContentRangeTotal,
  resolvePdfPreviewByteLength,
  type PdfDataRangeTransportLike,
} from "@/lib/attachments/pdfjs-preview-transport";

class StubRangeTransport implements PdfDataRangeTransportLike {
  length: number;
  initialData: Uint8Array | null;
  onDataRange = vi.fn<(begin: number, chunk: Uint8Array | null) => void>();

  constructor(length: number, initialData: Uint8Array | null) {
    this.length = length;
    this.initialData = initialData;
  }

  requestDataRange(): void {}
  abort(): void {}
}

describe("PDF preview range transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a known size without probing the content URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      resolvePdfPreviewByteLength("/content", 1_048_576)
    ).resolves.toBe(1_048_576);
    expect(knownPdfByteLength(0)).toBe(0);
    expect(knownPdfByteLength(undefined)).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("probes bytes=0-0 when the attachment size is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        headers: new Headers({ "Content-Range": "bytes 0-0/250000" }),
      })
    );

    await expect(resolvePdfPreviewByteLength("/content", 0)).resolves.toBe(
      250000
    );
    expect(fetch).toHaveBeenCalledWith(
      "/content",
      expect.objectContaining({
        credentials: "include",
        headers: { Range: "bytes=0-0" },
      })
    );
  });

  it("parses Content-Range totals", () => {
    expect(parseContentRangeTotal("bytes 0-0/99")).toBe(99);
    expect(parseContentRangeTotal("bytes */1500")).toBe(1500);
    expect(parseContentRangeTotal("bytes 0-0/*")).toBe(0);
    expect(parseContentRangeTotal(null)).toBe(0);
  });

  it("fetches a half-open pdf.js range as an inclusive HTTP Range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 206,
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      })
    );

    const bytes = await fetchPdfByteRange("/content", 0, 4);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
    expect(fetch).toHaveBeenCalledWith(
      "/content",
      expect.objectContaining({
        credentials: "include",
        headers: { Range: "bytes=0-3" },
      })
    );
  });

  it("delivers range bytes through the pdf.js transport and never starts a full GET", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 206,
        arrayBuffer: async () => new Uint8Array([9, 8, 7]).buffer,
      })
    );

    const transport = createPdfPreviewRangeTransport(StubRangeTransport, {
      url: "/api/reports/r1/attachments/a1/content?proxy=1",
      length: 99,
    });

    const onDataRange = vi.mocked(transport.onDataRange);
    transport.requestDataRange(10, 13);
    await vi.waitFor(() => {
      expect(onDataRange).toHaveBeenCalledWith(10, expect.any(Uint8Array));
    });
    const chunk = onDataRange.mock.calls[0]?.[1] as Uint8Array;
    expect(Array.from(chunk)).toEqual([9, 8, 7]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/r1/attachments/a1/content?proxy=1",
      expect.objectContaining({
        headers: { Range: "bytes=10-12" },
      })
    );
  });
});
