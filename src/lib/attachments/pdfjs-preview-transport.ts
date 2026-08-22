/**
 * Custom pdf.js range transport for same-origin attachment preview.
 *
 * `getDocument({ url })` always starts a full GET first, then Range-fetches
 * only if the response advertises `Content-Length` + `Accept-Ranges: bytes`.
 * Next.js/Vercel often strip `Content-Length` on streamed bodies, so that
 * abort never happens and the whole file still downloads through the app
 * server. Passing a known-length `PDFDataRangeTransport` skips that GET.
 *
 * `begin`/`end` are pdf.js half-open offsets (`end` exclusive). HTTP Range
 * and this repo's storage helpers use inclusive `end`.
 */

export type PdfDataRangeTransportLike = {
  onDataRange(begin: number, chunk: Uint8Array | null): void;
  requestDataRange(begin: number, end: number): void;
  abort(): void;
};

const CONTENT_RANGE_TOTAL = /\/(\d+)\s*$/;

export function knownPdfByteLength(sizeBytes: number | undefined): number {
  return Number.isInteger(sizeBytes) && (sizeBytes ?? 0) > 0 ? sizeBytes! : 0;
}

export async function resolvePdfPreviewByteLength(
  url: string,
  sizeBytes: number | undefined,
  signal?: AbortSignal
): Promise<number> {
  const known = knownPdfByteLength(sizeBytes);
  if (known > 0) return known;

  const response = await fetch(url, {
    headers: { Range: "bytes=0-0" },
    credentials: "include",
    signal,
  });
  const total = parseContentRangeTotal(response.headers.get("Content-Range"));
  if (total <= 0) {
    throw new Error("Could not determine PDF size for range preview");
  }
  return total;
}

export function parseContentRangeTotal(header: string | null): number {
  if (!header) return 0;
  const match = CONTENT_RANGE_TOTAL.exec(header);
  const total = match ? Number(match[1]) : 0;
  return Number.isInteger(total) && total > 0 ? total : 0;
}

export async function fetchPdfByteRange(
  url: string,
  begin: number,
  end: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (!Number.isInteger(begin) || !Number.isInteger(end) || end <= begin) {
    throw new Error("Invalid PDF byte range");
  }
  const response = await fetch(url, {
    headers: { Range: `bytes=${begin}-${end - 1}` },
    credentials: "include",
    signal,
  });
  if (response.status !== 206 && response.status !== 200) {
    throw new Error(`PDF range fetch failed (${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function createPdfPreviewRangeTransport(
  PDFDataRangeTransport: new (
    length: number,
    initialData: Uint8Array | null
  ) => PdfDataRangeTransportLike,
  args: { url: string; length: number; signal?: AbortSignal }
): PdfDataRangeTransportLike {
  class PreviewRangeTransport extends PDFDataRangeTransport {
    #aborted = false;

    constructor() {
      super(args.length, new Uint8Array());
    }

    requestDataRange(begin: number, end: number): void {
      void fetchPdfByteRange(args.url, begin, end, args.signal)
        .then((chunk) => {
          if (this.#aborted || args.signal?.aborted) return;
          // Copy: pdf.js transfers the ArrayBuffer to the worker.
          this.onDataRange(begin, chunk.slice());
        })
        .catch(() => {
          if (this.#aborted || args.signal?.aborted) return;
          this.onDataRange(begin, new Uint8Array());
        });
    }

    abort(): void {
      this.#aborted = true;
    }
  }

  return new PreviewRangeTransport();
}
