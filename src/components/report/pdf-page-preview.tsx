"use client";

import { memo, useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/attachments/load-pdfjs";
import {
  pdfjsPreviewDocumentOptions,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";
import {
  contentUrlFromPreviewSrc,
  layoutPreviewTextSpans,
  PDF_PREVIEW_SCALE,
  type PdfPreviewTextSpan,
  type PdfTextContentItem,
} from "@/lib/attachments/pdf-preview-layout";

type PreviewState =
  | { status: "loading" }
  | {
      status: "ready";
      pdf: PDFDocumentProxy;
      numPages: number;
      pageWidth: number;
      pageHeight: number;
    }
  | { status: "error" };

type PagePaintState =
  | { status: "pending" }
  | {
      status: "ready";
      pageWidth: number;
      pageHeight: number;
      spans: PdfPreviewTextSpan[];
    }
  | { status: "error" };

type DestroyableTask = {
  destroy: () => Promise<void>;
};

/**
 * Paints every PDF page to a scrollable stack of canvases with official
 * pdf.js (wasm + standard fonts) and a transparent text layer for select/copy.
 *
 * Do not put `application/pdf` in an iframe/embed: Chrome and Comet intercept
 * that navigation. Do not use the serverless `unpdf` renderer here — it skips
 * JBIG2/OpenJPEG wasm, which drops scanned page images and leaves empty tables.
 */
export function PdfPagePreview({
  src,
  page,
  title,
  onVisiblePageChange,
}: {
  src: string;
  page: number;
  title: string;
  onVisiblePageChange?: (page: number) => void;
}) {
  const contentUrl = contentUrlFromPreviewSrc(src);
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [loadedUrl, setLoadedUrl] = useState(contentUrl);
  if (loadedUrl !== contentUrl) {
    setLoadedUrl(contentUrl);
    setState({ status: "loading" });
  }
  const bytesCacheRef = useRef<{ url: string; data: Uint8Array } | null>(null);
  const onVisiblePageChangeRef = useRef(onVisiblePageChange);

  useEffect(() => {
    onVisiblePageChangeRef.current = onVisiblePageChange;
  }, [onVisiblePageChange]);

  useEffect(() => {
    const session: { cancelled: boolean; task: DestroyableTask | null } = {
      cancelled: false,
      task: null,
    };

    void (async () => {
      try {
        let data =
          bytesCacheRef.current?.url === contentUrl
            ? bytesCacheRef.current.data
            : null;
        if (!data) {
          const response = await fetch(contentUrl, {
            credentials: "same-origin",
          });
          if (!response.ok) {
            throw new Error(`Preview fetch failed (${response.status})`);
          }
          data = new Uint8Array(await response.arrayBuffer());
          bytesCacheRef.current = { url: contentUrl, data };
        }
        if (session.cancelled) return;

        const { getDocument, GlobalWorkerOptions, version: pdfjsVersion } =
          await loadPdfjs();
        if (session.cancelled) return;
        GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc(pdfjsVersion);
        const loadingTask = getDocument({
          data: data.slice(),
          ...pdfjsPreviewDocumentOptions(pdfjsVersion),
        });
        session.task = loadingTask;
        const pdf = await loadingTask.promise;
        if (session.cancelled) return;
        if (pdf.numPages < 1) {
          throw new Error("PDF has no pages");
        }
        const firstPage = await pdf.getPage(1);
        const viewport = firstPage.getViewport({ scale: PDF_PREVIEW_SCALE });
        if (session.cancelled) return;
        setState({
          status: "ready",
          pdf,
          numPages: pdf.numPages,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
        });
      } catch {
        if (!session.cancelled) {
          setState({ status: "error" });
        }
      }
    })();

    return () => {
      session.cancelled = true;
      void session.task?.destroy();
    };
  }, [contentUrl]);

  if (state.status === "error") {
    return (
      <div className="h-full overflow-auto bg-[var(--muted)]">
        <div className="p-6 text-sm text-[var(--muted-foreground)]">
          Could not render this page in the browser. Use Download to open the
          file.
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="h-full overflow-auto bg-[var(--muted)]">
        <div className="p-6 text-sm text-[var(--muted-foreground)]">
          Loading preview…
        </div>
      </div>
    );
  }

  return (
    <PdfDocumentPages
      pdf={state.pdf}
      numPages={state.numPages}
      title={title}
      pageWidth={state.pageWidth}
      pageHeight={state.pageHeight}
      initialPage={page}
      onVisiblePageChangeRef={onVisiblePageChangeRef}
    />
  );
}

function PdfDocumentPages({
  pdf,
  numPages,
  title,
  pageWidth,
  pageHeight,
  initialPage,
  onVisiblePageChangeRef,
}: {
  pdf: PDFDocumentProxy;
  numPages: number;
  title: string;
  pageWidth: number;
  pageHeight: number;
  initialPage: number;
  onVisiblePageChangeRef: RefObject<((page: number) => void) | undefined>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [paintedPages, setPaintedPages] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const allPages = Array.from({ length: numPages }, (_, index) => index + 1);

    const markPainted = (pages: number[]) => {
      setPaintedPages((prev) => {
        let next: Set<number> | null = null;
        for (const pageNumber of pages) {
          if (prev.has(pageNumber)) continue;
          next ??= new Set(prev);
          next.add(pageNumber);
        }
        return next ?? prev;
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      markPainted(allPages);
      return;
    }

    const prefetch = new IntersectionObserver(
      (entries) => {
        const visible = entries.flatMap((entry) => {
          if (!entry.isIntersecting) return [];
          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.pdfPage
          );
          return Number.isInteger(pageNumber) ? [pageNumber] : [];
        });
        if (visible.length > 0) markPainted(visible);
      },
      { root, rootMargin: "800px 0px" }
    );

    const currentPage = new IntersectionObserver(
      (entries) => {
        let best: { page: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number(
            (entry.target as HTMLElement).dataset.pdfPage
          );
          if (!Number.isInteger(pageNumber)) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { page: pageNumber, ratio: entry.intersectionRatio };
          }
        }
        if (best) onVisiblePageChangeRef.current?.(best.page);
      },
      { root, threshold: [0.2, 0.45, 0.7] }
    );

    for (const node of root.querySelectorAll("[data-pdf-page]")) {
      prefetch.observe(node);
      currentPage.observe(node);
    }
    return () => {
      prefetch.disconnect();
      currentPage.disconnect();
    };
  }, [numPages, onVisiblePageChangeRef]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const targetPage = Number.isInteger(initialPage) ? initialPage : 1;
    if (targetPage <= 1) return;
    const target = root.querySelector(`[data-pdf-page="${targetPage}"]`);
    if (
      target instanceof HTMLElement &&
      typeof target.scrollIntoView === "function"
    ) {
      target.scrollIntoView({ block: "start" });
    }
  }, [initialPage, pdf]);

  return (
    <div
      ref={scrollRef}
      data-pdf-preview-scroll=""
      role="region"
      aria-label={`${title} preview`}
      className="h-full overflow-auto bg-[var(--muted)]"
    >
      <div className="flex flex-col items-center gap-4 p-4">
        {Array.from({ length: numPages }, (_, index) => index + 1).map(
          (pageNumber) => (
            <PdfPreviewPage
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              title={title}
              shouldRender={paintedPages.has(pageNumber)}
              fallbackWidth={pageWidth}
              fallbackHeight={pageHeight}
            />
          )
        )}
      </div>
    </div>
  );
}

const PdfPreviewPage = memo(function PdfPreviewPage({
  pdf,
  pageNumber,
  title,
  shouldRender,
  fallbackWidth,
  fallbackHeight,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  title: string;
  shouldRender: boolean;
  fallbackWidth: number;
  fallbackHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<PagePaintState>({ status: "pending" });

  useEffect(() => {
    if (!shouldRender) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          throw new Error("Canvas 2D is not available");
        }
        const pdfPage = await pdf.getPage(pageNumber);
        if (controller.signal.aborted) return;
        const viewport = pdfPage.getViewport({ scale: PDF_PREVIEW_SCALE });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;
        const spans = await readPreviewTextSpans(pdfPage, viewport.height);
        if (!controller.signal.aborted) {
          setState({
            status: "ready",
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
  }, [pdf, pageNumber, shouldRender]);

  const ready = state.status === "ready";
  const width = ready ? state.pageWidth : fallbackWidth;
  const height = ready ? state.pageHeight : fallbackHeight;

  return (
    <div
      data-pdf-page={pageNumber}
      className="pdf-page-preview relative max-w-full bg-white shadow-sm [container-type:inline-size]"
      style={{ width, minHeight: height }}
    >
      {state.status === "error" ? (
        <div className="p-6 text-sm text-[var(--muted-foreground)]">
          Could not render page {pageNumber}. Use Download to open the file.
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        aria-label={`${title}, page ${pageNumber}`}
        className={ready ? "block h-auto w-full" : "hidden"}
      />
      {ready ? (
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
      ) : null}
    </div>
  );
});

async function readPreviewTextSpans(
  pdfPage: PDFPageProxy,
  scaledPageHeight: number
): Promise<PdfPreviewTextSpan[]> {
  try {
    const content = await pdfPage.getTextContent();
    const pageHeight = scaledPageHeight / PDF_PREVIEW_SCALE;
    return layoutPreviewTextSpans(
      (content.items as readonly unknown[]).filter(isTextContentItem),
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
  return (
    Array.isArray(transform) && typeof (item as { str: unknown }).str === "string"
  );
}
