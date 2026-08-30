/** Distance from the bottom that still counts as “following” the thread. */
export const CHAT_NEAR_BOTTOM_PX = 48;

export type ChatScrollPosition =
  | { kind: "bottom" }
  | { kind: "offset"; fromBottom: number };

type ChatScrollerMetrics = Pick<
  HTMLElement,
  "scrollTop" | "scrollHeight" | "clientHeight"
>;

export function isChatScrollerLaidOut(
  el: Pick<HTMLElement, "clientHeight">
): boolean {
  return el.clientHeight > 0;
}

/**
 * Snapshot the scroller while it has a layout box. Returns null when the
 * panel is `display: none` (metrics are 0) so a hide must not overwrite the
 * last real position.
 */
export function captureChatScrollPosition(
  el: ChatScrollerMetrics
): ChatScrollPosition | null {
  if (!isChatScrollerLaidOut(el)) return null;
  const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (fromBottom <= CHAT_NEAR_BOTTOM_PX) return { kind: "bottom" };
  return { kind: "offset", fromBottom };
}

export function shouldStickChatToBottom(
  saved: ChatScrollPosition | null
): boolean {
  return saved == null || saved.kind === "bottom";
}

/** Re-apply the saved offset when the panel appears or its width changes. */
export function shouldReapplyChatScroll(args: {
  wasLaidOut: boolean;
  nowLaidOut: boolean;
  previousWidth: number;
  currentWidth: number;
}): boolean {
  if (!args.nowLaidOut) return false;
  if (!args.wasLaidOut) return true;
  return args.previousWidth !== args.currentWidth;
}

/** Instant pin — never `behavior: "smooth"` (it can resume after `display: none`). */
export function pinChatScrollerToBottom(el: ChatScrollerMetrics): void {
  if (!isChatScrollerLaidOut(el)) return;
  el.scrollTop = el.scrollHeight;
}

/** Instant restore. Unknown / bottom → pin to the end of the thread. */
export function restoreChatScrollPosition(
  el: ChatScrollerMetrics,
  saved: ChatScrollPosition | null
): void {
  if (!isChatScrollerLaidOut(el)) return;
  if (saved == null) {
    pinChatScrollerToBottom(el);
    return;
  }
  switch (saved.kind) {
    case "bottom":
      pinChatScrollerToBottom(el);
      return;
    case "offset":
      el.scrollTop = Math.max(
        0,
        el.scrollHeight - el.clientHeight - saved.fromBottom
      );
      return;
    default: {
      const _exhaustive: never = saved;
      return _exhaustive;
    }
  }
}
