/** Matches DOCX inline drawing export caps in `registerInlineImage`. */
export const IMAGE_INLINE_MIN_WIDTH_PX = 96;
export const IMAGE_INLINE_MAX_WIDTH_PX = 600;

export function clampImageInlineWidth(widthPx: number): number {
  return Math.max(
    IMAGE_INLINE_MIN_WIDTH_PX,
    Math.min(IMAGE_INLINE_MAX_WIDTH_PX, Math.round(widthPx))
  );
}
