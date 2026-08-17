"use client";

import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from "pdfjs-dist";
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
  type PdfTextContentStyle,
} from "@/lib/attachments/pdf-preview-layout";

type PreviewState =
  | { status: "loading" }
  | {
      status: "ready";
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

/**
 * Paints one PDF page to a canvas with official pdf.js (wasm + standard fonts)
 * and overlays a transparent text layer for select/copy.
 *
 * Do not put `application/pdf` in an iframe/embed: Chrome and Comet intercept
 * that navigation. Do not use the serverless `unpdf` renderer here — it skips
 * JBIG2/OpenJPEG wasm, which drops scanned page images and leaves empty tables.
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    void (async () => {
      try {
        const url = contentUrlFromPreviewSrc(src);
        let data =
          bytesCacheRef.current?.url === url
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

        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
          throw new Error("Canvas 2D is not available");
        }

        GlobalWorkerOptions.workerSrc = pdfjsWorkerSrc(pdfjsVersion);
        const loadingTask = getDocument({
          data: data.slice(),
          ...pdfjsPreviewDocumentOptions(pdfjsVersion),
        });
        const pdf = await loadingTask.promise;
        try {
          if (controller.signal.aborted) return;
          const pdfPage = await pdf.getPage(page);
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
        } finally {
          await loadingTask.destroy();
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: "error" });
        }
      }
    })();

    return () => controller.abort();
  }, [src, page]);

  const ready = state.status === "ready";

  return (
    <div className="overflow-auto bg-[var(--muted)]">
      {state.status === "error" ? (
        <div className="p-6 text-sm text-[var(--muted-foreground)]">
          Could not render this page in the browser. Use Download to open the
          file.
        </div>
      ) : null}
      {state.status === "loading" ? (
        <div className="p-6 text-sm text-[var(--muted-foreground)]">
          Loading preview…
        </div>
      ) : null}
      <div
        className={
          ready
            ? "pdf-page-preview relative mx-auto max-w-full bg-white [container-type:inline-size]"
            : "hidden"
        }
        style={ready ? { width: state.pageWidth } : undefined}
      >
        <canvas
          ref={canvasRef}
          aria-label={`${title}, page ${page}`}
          className="block h-auto w-full"
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
  return (
    Array.isArray(transform) && typeof (item as { str: unknown }).str === "string"
  );
}
