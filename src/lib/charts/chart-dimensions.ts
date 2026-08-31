/** Logical canvas size for server-side chart rasterization. */
export const CHART_LOGICAL_WIDTH = 960;
export const CHART_LOGICAL_HEIGHT = 720;

/** Display width written onto the imageInline node (DOCX caps at 600). */
export const CHART_DISPLAY_WIDTH_PX = 600;

/**
 * Narrative figure width when chat inserts a plot. Same box as Analytics
 * preview capture and the editor Insert graph menu — do not shrink by
 * height, or a sixpack (2×3) becomes a thin unreadable strip.
 */
export function documentInsertedPlotWidth(preview: {
  widthPx: number;
  heightPx?: number;
}): number {
  const width = Math.max(1, preview.widthPx);
  return Math.min(width, CHART_DISPLAY_WIDTH_PX);
}
