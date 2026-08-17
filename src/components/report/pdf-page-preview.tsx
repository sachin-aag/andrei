"use client";

import { useEffect, useRef, useState } from "react";
import {
  contentUrlFromPreviewSrc,
  layoutPreviewTextSpans,
  PDF_PREVIEW_SCALE,
  type PdfPreviewTextSpan,
  type PdfTextContentItem,
  type PdfTextContentStyle,
} from "@/lib/attachments/pdf-preview-layout";

type PreviewState =
  | { status: "loading" }
  | {
      status: "ready";
      imageSrc: string;
      pageWidth: number;
      pageHeight: number;
      spans: PdfPreviewTextSpan[];
    }
  | { status: "error" };

type PdfTextContent = {
  items: unknown[];
  styles?: Record<string, PdfTextContentStyle | undefined>;
};

type PdfPageProxy = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<PdfTextContent>;
};

type PdfDocumentProxy = {
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
};

/**
 * Renders one PDF page as an image plus a transparent text layer.
 *
 * Do not put `application/pdf` in an iframe/embed: Chrome and Comet intercept
 * that navigation and show a block page even when the bytes are streamed from
 * our own origin.
 */
export function PdfPagePreview({
  src,
  page,
  title,
}: {
  src: string;
  page: number;
  title: string;
}) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const bytesCacheRef = useRef<{ url: string; data: Uint8Array } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void (async () => {
      try {
        const url = contentUrlFromPreviewSrc(src);
        let data = bytesCacheRef.current?.url === url
          ? bytesCacheRef.current.data
          : null;
        if (!data) {
          const response = await fetch(url, {
            credentials: "same-origin",
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`Preview fetch failed (${response.status})`);
          }
          data = new Uint8Array(await response.arrayBuffer());
          bytesCacheRef.current = { url, data };
        }
        ensureMathSumPrecise();
        const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
        // Slice so pdf.js can transfer the buffer without dropping our copy.
        const pdf = (await getDocumentProxy(data.slice())) as PdfDocumentProxy;
        const pdfPage = await pdf.getPage(page);
        const viewport = pdfPage.getViewport({ scale: PDF_PREVIEW_SCALE });
        const imageSrc = await renderPageAsImage(pdf, page, {
          scale: PDF_PREVIEW_SCALE,
          toDataURL: true,
        });
        const spans = await readPreviewTextSpans(pdfPage, viewport.height);
        if (!controller.signal.aborted) {
          setState({
            status: "ready",
            imageSrc,
            pageWidth: viewport.width,
            pageHeight: viewport.height,
            spans,
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      }
    })();

    return () => controller.abort();
  }, [src, page]);

  if (state.status === "error") {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Could not render this page in the browser. Use Download to open the file.
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="overflow-auto bg-[var(--muted)]">
      <div
        className="pdf-page-preview relative mx-auto max-w-full bg-white [container-type:inline-size]"
        style={{ width: state.pageWidth }}
      >
        <img
          src={state.imageSrc}
          alt={`${title}, page ${page}`}
          width={state.pageWidth}
          height={state.pageHeight}
          className="block h-auto w-full"
        />
        <div
          className="pdf-page-preview-text-layer"
          style={{
            width: state.pageWidth,
            height: state.pageHeight,
            transform: `scale(calc(100cqw / ${state.pageWidth}))`,
          }}
        >
          {state.spans.map((span, index) => (
            <span
              key={index}
              dir={span.dir === "ttb" ? undefined : span.dir}
              style={{
                left: span.left,
                top: span.top,
                width: span.width,
                height: span.height,
                fontSize: span.fontSize,
                fontFamily: span.fontFamily || undefined,
              }}
            >
              {span.str}
              {span.hasEOL ? "\n" : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

async function readPreviewTextSpans(
  pdfPage: PdfPageProxy,
  scaledPageHeight: number
): Promise<PdfPreviewTextSpan[]> {
  try {
    const content = await pdfPage.getTextContent();
    const pageHeight = scaledPageHeight / PDF_PREVIEW_SCALE;
    return layoutPreviewTextSpans(
      content.items.filter(isTextContentItem),
      content.styles ?? {},
      pageHeight,
      PDF_PREVIEW_SCALE
    );
  } catch {
    return [];
  }
}

function isTextContentItem(item: unknown): item is PdfTextContentItem {
  if (typeof item !== "object" || item === null) return false;
  if (!("str" in item) || !("transform" in item) || !("width" in item)) {
    return false;
  }
  const transform = (item as { transform: unknown }).transform;
  return Array.isArray(transform) && typeof (item as { str: unknown }).str === "string";
}

type MathWithSumPrecise = Math & {
  sumPrecise?: (values: Iterable<number>) => number;
};

function ensureMathSumPrecise(): void {
  const target = Math as MathWithSumPrecise;
  if (typeof target.sumPrecise === "function") return;
  target.sumPrecise = (values) => {
    let total = 0;
    for (const value of values) total += value;
    return total;
  };
}
