export const CHAT_VISIBLE_TAIL = 12;
export const CHAT_VISIBLE_PAGE = 16;
export const CHAT_LOAD_MORE_SCROLL_PX = 80;

/** First index of the currently rendered tail. Older turns stay unmounted. */
export function visibleMessageStartIndex(
  total: number,
  visibleCount: number
): number {
  if (total <= 0) return 0;
  return Math.max(0, total - Math.max(0, visibleCount));
}

export function nextVisibleCount(
  current: number,
  total: number,
  page = CHAT_VISIBLE_PAGE
): number {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(0, current) + page);
}

export function shouldLoadOlderMessages(
  scrollTop: number,
  visibleCount: number,
  total: number,
  thresholdPx = CHAT_LOAD_MORE_SCROLL_PX
): boolean {
  return total > visibleCount && scrollTop <= thresholdPx;
}
