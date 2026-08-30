/** Logical canvas size for server-side chart rasterization. */
export const CHART_LOGICAL_WIDTH = 960;
export const CHART_LOGICAL_HEIGHT = 720;

/** Display width written onto the imageInline node (DOCX caps at 600). */
export const CHART_DISPLAY_WIDTH_PX = 600;

/**
 * Narrative figure box when chat inserts a plot. CSS width on imageInline;
 * height follows the bitmap aspect so a sixpack does not dominate the page.
 */
export const DOCUMENT_INSERTED_PLOT_MAX_WIDTH_PX = 480;
export const DOCUMENT_INSERTED_PLOT_MAX_HEIGHT_PX = 300;

export function documentInsertedPlotWidth(preview: {
  widthPx: number;
  heightPx: number;
}): number {
  const width = Math.max(1, preview.widthPx);
  const height = Math.max(1, preview.heightPx);
  const maxWidthFromHeight = Math.round(
    DOCUMENT_INSERTED_PLOT_MAX_HEIGHT_PX / (height / width)
  );
  return Math.max(
    160,
    Math.min(width, DOCUMENT_INSERTED_PLOT_MAX_WIDTH_PX, maxWidthFromHeight)
  );
}
