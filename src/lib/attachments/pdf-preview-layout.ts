/**
 * Layout helpers for the in-browser PDF page preview.
 *
 * PDF.js text items use a bottom-left origin. The preview paints the page as
 * an image (top-left origin) and overlays transparent spans so the user can
 * select/copy without navigating an iframe to `application/pdf`.
 */

export const PDF_PREVIEW_SCALE = 1.5;

/** Horizontal padding on the scroll stack (`p-4` left + right). */
export const PDF_PREVIEW_HORIZONTAL_PADDING = 32;

/**
 * Inner page stack. `w-max min-w-full` sizes the stack to the wider of the
 * viewport and the page so a zoomed-in or landscape page can be scrolled to
 * its left edge. Flex `items-center` alone overflow-centers a wider child;
 * that left overflow is not in the scrollport, so the scrollbar sits at 0
 * while the left of the page is clipped. Portrait at 100% already fits, so
 * it did not hit this.
 */
export const PDF_PREVIEW_PAGE_STACK_CLASSNAME =
  "flex w-max min-w-full flex-col items-center gap-4 p-4";

/** US Letter at 72pt — placeholder size until the first painted page reports its viewport. */
export const PDF_FALLBACK_PAGE_WIDTH = 612 * PDF_PREVIEW_SCALE;
export const PDF_FALLBACK_PAGE_HEIGHT = 792 * PDF_PREVIEW_SCALE;

/** Placeholder box for a page that has not painted yet, swapped on 90° / 270°. */
export function pdfPreviewPageSizeForRotation(
  width: number,
  height: number,
  rotation: number
): { width: number; height: number } {
  const quarterTurns = (((rotation % 360) + 360) % 360) / 90;
  if (quarterTurns === 1 || quarterTurns === 3) {
    return { width: height, height: width };
  }
  return { width, height };
}

export function pdfPreviewFallbackPageSize(rotation: number): {
  width: number;
  height: number;
} {
  return pdfPreviewPageSizeForRotation(
    PDF_FALLBACK_PAGE_WIDTH,
    PDF_FALLBACK_PAGE_HEIGHT,
    rotation
  );
}

/**
 * Viewer zoom is relative to fit-to-width in the preview panel, not raw PDF
 * points. At zoom 1 the page spans the scroll viewport (minus padding).
 */
export function pdfPreviewRenderScale({
  viewportWidth,
  pageWidthAtBaseScale,
  zoomLevel,
  horizontalPadding = PDF_PREVIEW_HORIZONTAL_PADDING,
}: {
  viewportWidth: number;
  pageWidthAtBaseScale: number;
  zoomLevel: number;
  horizontalPadding?: number;
}): number {
  if (pageWidthAtBaseScale <= 0) {
    return PDF_PREVIEW_SCALE * zoomLevel;
  }
  if (viewportWidth <= horizontalPadding) {
    return PDF_PREVIEW_SCALE * zoomLevel;
  }
  const availableWidth = viewportWidth - horizontalPadding;
  const fitScale = availableWidth / pageWidthAtBaseScale;
  return PDF_PREVIEW_SCALE * fitScale * zoomLevel;
}

/** Default typographic ascent when the font style does not report one. */
const DEFAULT_ASCENT = 0.8;

export type PdfTextContentItem = {
  str: string;
  transform: readonly number[];
  width: number;
  height: number;
  fontName?: string;
  dir?: string;
  hasEOL?: boolean;
};

export type PdfTextContentStyle = {
  fontFamily?: string;
  ascent?: number;
};

export type PdfPreviewTextSpan = {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  dir: "ltr" | "rtl" | "ttb";
  hasEOL: boolean;
};

export function contentUrlFromPreviewSrc(src: string): string {
  const hash = src.indexOf("#");
  const withoutHash = hash === -1 ? src : src.slice(0, hash);
  try {
    const url = new URL(withoutHash, "http://pdf-preview.local");
    // `page` is only a viewer hint. pdf.js Range-requests this URL, so keep
    // one cache key across page changes.
    url.searchParams.delete("page");
    return `${url.pathname}${url.search}`;
  } catch {
    return withoutHash;
  }
}

export function layoutPreviewTextSpans(
  items: readonly PdfTextContentItem[],
  styles: Readonly<Record<string, PdfTextContentStyle | undefined>>,
  pageHeight: number,
  scale: number = PDF_PREVIEW_SCALE
): PdfPreviewTextSpan[] {
  const spans: PdfPreviewTextSpan[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const span = layoutPreviewTextSpan(item, styles, pageHeight, scale);
    if (span) spans.push(span);
  }
  return spans;
}

export function layoutPreviewTextSpan(
  item: PdfTextContentItem,
  styles: Readonly<Record<string, PdfTextContentStyle | undefined>>,
  pageHeight: number,
  scale: number = PDF_PREVIEW_SCALE
): PdfPreviewTextSpan | null {
  if (!item.str) return null;
  const transform = item.transform;
  if (transform.length < 6) return null;

  const c = transform[2] ?? 0;
  const d = transform[3] ?? 0;
  const x = transform[4] ?? 0;
  const y = transform[5] ?? 0;
  const fontSize = Math.hypot(c, d);
  const style = item.fontName ? styles[item.fontName] : undefined;
  const ascentRatio =
    typeof style?.ascent === "number" && Number.isFinite(style.ascent)
      ? style.ascent
      : DEFAULT_ASCENT;
  const cssFontSize = fontSize * scale;
  const height = (item.height > 0 ? item.height : fontSize) * scale;

  return {
    str: item.str,
    left: x * scale,
    // PDF y is the baseline from the bottom; CSS top is from the page top.
    top: (pageHeight - y) * scale - ascentRatio * cssFontSize,
    width: item.width * scale,
    height,
    fontSize: cssFontSize,
    fontFamily: style?.fontFamily ?? "",
    dir: textDirection(item.dir),
    hasEOL: item.hasEOL === true,
  };
}

function textDirection(dir: string | undefined): PdfPreviewTextSpan["dir"] {
  switch (dir) {
    case "rtl":
      return "rtl";
    case "ttb":
      return "ttb";
    case "ltr":
      return "ltr";
    default:
      return "ltr";
  }
}
