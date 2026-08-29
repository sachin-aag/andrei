/** US Letter — matches Word's default page for the generic template. */
export const GENERIC_PAGE_WIDTH = "8.5in";
export const GENERIC_PAGE_HEIGHT = "11in";
export const GENERIC_PAGE_MARGIN = "0.9in";

export function pageCountForContentHeight(
  contentHeightPx: number,
  pageHeightPx: number
): number {
  if (!(pageHeightPx > 0)) return 1;
  if (!(contentHeightPx > 0)) return 1;
  // Sub-pixel rounding on an empty Letter sheet should stay one page.
  return Math.max(1, Math.ceil((contentHeightPx - 0.5) / pageHeightPx));
}
