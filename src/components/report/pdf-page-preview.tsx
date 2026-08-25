"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { loadPdfjs } from "@/lib/attachments/load-pdfjs";
import {
  pdfjsPreviewLoadingOptions,
  pdfjsWorkerSrc,
} from "@/lib/attachments/pdfjs-browser";
import {
  contentUrlFromPreviewSrc,
  layoutPreviewTextSpans,
  PDF_FALLBACK_PAGE_HEIGHT,
  PDF_FALLBACK_PAGE_WIDTH,
  PDF_PREVIEW_SCALE,
  type PdfPreviewTextSpan,
  type PdfTextContentItem,
} from "@/lib/attachments/pdf-preview-layout";

type PreviewState =
  | { status: "loading"; loadedBytes: number; totalBytes: number }
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
  | { status: "painted"; pageWidth: number; pageHeight: number }
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
 * Paints PDF pages to a scrollable stack of canvases with official pdf.js
 * (wasm + standard fonts) and a transparent text layer for select/copy.
 *
 * pdf.js fetches the URL itself (one streamed GET — see
 * `pdfjsPreviewLoadingOptions` for why ranges lose here) so the bytes go
 * straight to the worker instead of through an `arrayBuffer()` on the main
 * thread. The requested page paints first; neighbors follow once it is on
 * screen. Each canvas is shown as soon as it paints — the text layer follows.
 * Only pages near the viewport keep a canvas, so a 1000-page scan does not
 * retain a bitmap per page.
 *
 * Do not put `application/pdf` in an iframe/embed: Chrome and Comet intercept
 * that navigation. Do not use the serverless `unpdf` renderer here — it skips
 * JBIG2/OpenJPEG wasm, which drops scanned page images and leaves empty tables.
 */
export function PdfPagePreview({
  src,
  page,
  title,
  sizeBytes,
  onVisiblePageChange,
}: {
  src: string;
  page: number;
  title: string;
  sizeBytes?: number;
  onVisiblePageChange?: (page: number) => void;
}) {
  const contentUrl = contentUrlFromPreviewSrc(src);
  const initialLoading: PreviewState = {
    status: "loading",
    loadedBytes: 0,
    totalBytes: sizeBytes ?? 0,
  };
  const [state, setState] = useState<PreviewState>(initialLoading);
  const [loadedUrl, setLoadedUrl] = useState(contentUrl);
  if (loadedUrl !== contentUrl) {
    setLoadedUrl(contentUrl);
    setState(initialLoading);
  }
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
        const { getDocument, GlobalWorkerOptions, version: pdfjsVersion } =
          await loadPdfjs();
        if (session.cancelled) return;
        GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc(pdfjsVersion);
        const loadingTask = getDocument({
          url: contentUrl,
          ...pdfjsPreviewLoadingOptions(pdfjsVersion),
        });
        session.task = loadingTask;
        // Streamed responses can arrive without Content-Length; fall back to
        // the size the attachment record already knows.
        loadingTask.onProgress = ({
          loaded,
          total,
        }: {
          loaded: number;
          total: number;
        }) => {
          if (session.cancelled) return;
          setState((prev) =>
            prev.status === "loading"
              ? {
                  status: "loading",
                  loadedBytes: loaded,
                  totalBytes: total || sizeBytes || 0,
                }
              : prev
          );
        };
        const pdf = await loadingTask.promise;
        if (session.cancelled) return;
        if (pdf.numPages < 1) {
          throw new Error("PDF has no pages");
        }
        setState({
          status: "ready",
          pdf,
          numPages: pdf.numPages,
          pageWidth: PDF_FALLBACK_PAGE_WIDTH,
          pageHeight: PDF_FALLBACK_PAGE_HEIGHT,
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
  }, [contentUrl, sizeBytes]);

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
          {formatPreviewProgress(state.loadedBytes, state.totalBytes)}
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
  const [prefetchNeighbors, setPrefetchNeighbors] = useState(false);
  const enableNeighborPrefetch = useCallback(() => {
    setPrefetchNeighbors(true);
  }, []);
  // Live window, not a growing set: pages that scroll away release their
  // canvas. A 1000-page scan at PDF_PREVIEW_SCALE would otherwise retain
  // several GB of bitmaps by the time the user reaches the end.
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const updateNearPages = (changes: Map<number, boolean>) => {
      setNearPages((prev) => {
        let next: Set<number> | null = null;
        for (const [pageNumber, isNear] of changes) {
          if (prev.has(pageNumber) === isNear) continue;
          next ??= new Set(prev);
          if (isNear) next.add(pageNumber);
          else next.delete(pageNumber);
        }
        return next ?? prev;
      });
    };

    if (typeof IntersectionObserver === "undefined") {
      updateNearPages(
        new Map(
          Array.from({ length: numPages }, (_, index) => [index + 1, true])
        )
      );
      return;
    }

    const prefetch = prefetchNeighbors
      ? new IntersectionObserver(
          (entries) => {
            const changes = new Map<number, boolean>();
            for (const entry of entries) {
              const pageNumber = Number(
                (entry.target as HTMLElement).dataset.pdfPage
              );
              if (Number.isInteger(pageNumber)) {
                changes.set(pageNumber, entry.isIntersecting);
              }
            }
            if (changes.size > 0) updateNearPages(changes);
          },
          { root, rootMargin: "800px 0px" }
        )
      : null;

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
      prefetch?.observe(node);
      currentPage.observe(node);
    }
    return () => {
      prefetch?.disconnect();
      currentPage.disconnect();
    };
  }, [numPages, onVisiblePageChangeRef, prefetchNeighbors]);

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
              shouldRender={
                pageNumber === initialPaintedPageNumber(initialPage) ||
                nearPages.has(pageNumber)
              }
              onRequestedPageSettled={
                pageNumber === initialPaintedPageNumber(initialPage)
                  ? enableNeighborPrefetch
                  : undefined
              }
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
  onRequestedPageSettled,
  fallbackWidth,
  fallbackHeight,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  title: string;
  shouldRender: boolean;
  onRequestedPageSettled?: () => void;
  fallbackWidth: number;
  fallbackHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<PagePaintState>({ status: "pending" });
  if (!shouldRender && state.status !== "pending") {
    setState({ status: "pending" });
  }

  useEffect(() => {
    if (!shouldRender) {
      // Scrolled out of the window: drop the bitmap. Setting width to 0 frees
      // the backing store, which `display: none` alone does not.
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }
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
        if (controller.signal.aborted) return;
        setState({
          status: "painted",
          pageWidth: viewport.width,
          pageHeight: viewport.height,
        });
        onRequestedPageSettled?.();
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
          onRequestedPageSettled?.();
        }
      }
    })();

    return () => controller.abort();
  }, [pdf, pageNumber, shouldRender, onRequestedPageSettled]);

  const canvasVisible = isCanvasVisible(state);
  const width = canvasVisible ? state.pageWidth : fallbackWidth;
  const height = canvasVisible ? state.pageHeight : fallbackHeight;

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
        className={canvasVisible ? "block h-auto w-full" : "hidden"}
      />
      {state.status === "ready" ? (
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

function initialPaintedPageNumber(page: number): number {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Large attachments take real seconds to transfer. Showing megabytes moving
 * is the difference between "loading" and "hung" for a 130 MB report.
 */
export function formatPreviewProgress(
  loadedBytes: number,
  totalBytes: number
): string {
  if (loadedBytes <= 0) return "Loading preview…";
  const loadedMb = loadedBytes / 1_000_000;
  if (totalBytes <= 0) {
    return `Loading preview… ${loadedMb.toFixed(1)} MB`;
  }
  const percent = Math.min(
    99,
    Math.max(1, Math.round((loadedBytes / totalBytes) * 100))
  );
  return `Loading preview… ${percent}% of ${(totalBytes / 1_000_000).toFixed(
    1
  )} MB`;
}

function isCanvasVisible(
  state: PagePaintState
): state is Extract<PagePaintState, { status: "painted" | "ready" }> {
  switch (state.status) {
    case "painted":
    case "ready":
      return true;
    case "pending":
    case "error":
      return false;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

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
