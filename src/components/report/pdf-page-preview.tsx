"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const PDF_ZOOM_MIN = 0.5;
const PDF_ZOOM_MAX = 3;
const PDF_ZOOM_STEP = 0.25;
const PDF_ZOOM_DEFAULT = 1;

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
  const [visiblePage, setVisiblePage] = useState(
    initialPaintedPageNumber(initialPage)
  );
  const [pageInput, setPageInput] = useState(String(initialPaintedPageNumber(initialPage)));
  const [pageInputFocused, setPageInputFocused] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(PDF_ZOOM_DEFAULT);
  const [rotation, setRotation] = useState(0);
  const enableNeighborPrefetch = useCallback(() => {
    setPrefetchNeighbors(true);
  }, []);
  const reportVisiblePage = useCallback((page: number) => {
    setVisiblePage(page);
    onVisiblePageChangeRef.current?.(page);
  }, [onVisiblePageChangeRef]);
  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.min(Math.max(1, Math.round(page)), numPages);
      setPageInput(String(clamped));
      const root = scrollRef.current;
      if (!root) return;
      const target = root.querySelector(`[data-pdf-page="${clamped}"]`);
      if (
        target instanceof HTMLElement &&
        typeof target.scrollIntoView === "function"
      ) {
        target.scrollIntoView({ block: "start" });
      }
      reportVisiblePage(clamped);
    },
    [numPages, reportVisiblePage]
  );
  const handlePageSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsed = Number.parseInt(pageInput, 10);
      if (Number.isFinite(parsed)) {
        goToPage(parsed);
      } else {
        setPageInput(String(visiblePage));
      }
      (event.currentTarget.elements.namedItem("pdf-page") as HTMLInputElement | null)?.blur();
    },
    [goToPage, pageInput, visiblePage]
  );
  const zoomIn = useCallback(() => {
    setZoomLevel((prev) =>
      Math.min(PDF_ZOOM_MAX, roundZoom(prev + PDF_ZOOM_STEP))
    );
  }, []);
  const zoomOut = useCallback(() => {
    setZoomLevel((prev) =>
      Math.max(PDF_ZOOM_MIN, roundZoom(prev - PDF_ZOOM_STEP))
    );
  }, []);
  const rotatePage = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);
  // Live window, not a growing set: pages that scroll away release their
  // canvas. A 1000-page scan at PDF_PREVIEW_SCALE would otherwise retain
  // several GB of bitmaps by the time the user reaches the end.
  const [nearPages, setNearPages] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  useEffect(() => {
    if (!pageInputFocused) {
      setPageInput(String(visiblePage));
    }
  }, [pageInputFocused, visiblePage]);

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
        if (best) reportVisiblePage(best.page);
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
  }, [numPages, prefetchNeighbors, reportVisiblePage]);

  useEffect(() => {
    goToPage(initialPage);
  }, [goToPage, initialPage, pdf]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PdfPreviewToolbar
        numPages={numPages}
        pageInput={pageInput}
        zoomLevel={zoomLevel}
        rotation={rotation}
        onPageInputChange={setPageInput}
        onPageInputFocus={() => setPageInputFocused(true)}
        onPageInputBlur={() => setPageInputFocused(false)}
        onPageSubmit={handlePageSubmit}
        onRotate={rotatePage}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
      />
      <div
        ref={scrollRef}
        data-pdf-preview-scroll=""
        role="region"
        aria-label={`${title} preview`}
        className="min-h-0 flex-1 overflow-auto bg-[var(--muted)]"
      >
        <div className="flex flex-col items-center gap-4 p-4">
          {Array.from({ length: numPages }, (_, index) => index + 1).map(
            (pageNumber) => (
              <PdfPreviewPage
                key={pageNumber}
                pdf={pdf}
                pageNumber={pageNumber}
                title={title}
                zoomLevel={zoomLevel}
                rotation={rotation}
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
    </div>
  );
}

const PdfPreviewPage = memo(function PdfPreviewPage({
  pdf,
  pageNumber,
  title,
  zoomLevel,
  rotation,
  shouldRender,
  onRequestedPageSettled,
  fallbackWidth,
  fallbackHeight,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  title: string;
  zoomLevel: number;
  rotation: number;
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
        const renderScale = PDF_PREVIEW_SCALE * zoomLevel;
        const viewport = pdfPage.getViewport({
          scale: renderScale,
          rotation,
        });
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
        const spans =
          rotation === 0
            ? await readPreviewTextSpans(pdfPage, viewport.height, renderScale)
            : [];
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
  }, [
    pdf,
    pageNumber,
    rotation,
    shouldRender,
    onRequestedPageSettled,
    zoomLevel,
  ]);

  const canvasVisible = isCanvasVisible(state);
  const width = canvasVisible ? state.pageWidth : fallbackWidth;
  const height = canvasVisible ? state.pageHeight : fallbackHeight;

  return (
    <div
      data-pdf-page={pageNumber}
      className="pdf-page-preview relative shrink-0 bg-white shadow-sm [container-type:inline-size]"
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
        className={canvasVisible ? "block max-w-none" : "hidden"}
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

function PdfPreviewToolbar({
  numPages,
  pageInput,
  zoomLevel,
  rotation,
  onPageInputChange,
  onPageInputFocus,
  onPageInputBlur,
  onPageSubmit,
  onRotate,
  onZoomIn,
  onZoomOut,
}: {
  numPages: number;
  pageInput: string;
  zoomLevel: number;
  rotation: number;
  onPageInputChange: (value: string) => void;
  onPageInputFocus: () => void;
  onPageInputBlur: () => void;
  onPageSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRotate: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const zoomPercent = formatZoomPercent(zoomLevel);
  const zoomOutDisabled = zoomLevel <= PDF_ZOOM_MIN;
  const zoomInDisabled = zoomLevel >= PDF_ZOOM_MAX;

  return (
    <div
      data-testid="pdf-preview-toolbar"
      className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-4 py-2"
    >
      <form
        className="flex items-center gap-2 text-sm text-[var(--foreground)]"
        onSubmit={onPageSubmit}
      >
        <span className="text-[var(--muted-foreground)]">Page</span>
        <Input
          name="pdf-page"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pageInput}
          onChange={(event) => onPageInputChange(event.target.value)}
          onFocus={onPageInputFocus}
          onBlur={onPageInputBlur}
          aria-label="Page number"
          data-testid="pdf-toolbar-page-input"
          className="h-8 w-16 px-2 text-center"
        />
        <span className="text-[var(--muted-foreground)]">of {numPages}</span>
      </form>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRotate}
          aria-label={`Rotate page (${rotation}°)`}
          data-testid="pdf-toolbar-rotate"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Rotate
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          onClick={onZoomOut}
          disabled={zoomOutDisabled}
          aria-label="Zoom out"
          data-testid="pdf-toolbar-zoom-out"
        >
          <ZoomOut className="size-4" aria-hidden="true" />
        </Button>
        <span
          className="min-w-[3.5rem] text-center text-sm tabular-nums text-[var(--muted-foreground)]"
          aria-live="polite"
        >
          {zoomPercent}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8"
          onClick={onZoomIn}
          disabled={zoomInDisabled}
          aria-label="Zoom in"
          data-testid="pdf-toolbar-zoom-in"
        >
          <ZoomIn className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function initialPaintedPageNumber(page: number): number {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function roundZoom(value: number): number {
  return Math.round(value / PDF_ZOOM_STEP) * PDF_ZOOM_STEP;
}

function formatZoomPercent(zoomLevel: number): string {
  return `${Math.round(zoomLevel * 100)}%`;
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
  scaledPageHeight: number,
  scale: number = PDF_PREVIEW_SCALE
): Promise<PdfPreviewTextSpan[]> {
  try {
    const content = await pdfPage.getTextContent();
    const pageHeight = scaledPageHeight / scale;
    return layoutPreviewTextSpans(
      (content.items as readonly unknown[]).filter(isTextContentItem),
      content.styles ?? {},
      pageHeight,
      scale
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
