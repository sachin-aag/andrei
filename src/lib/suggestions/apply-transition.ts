/** Pause after the doc updates so the user sees the applied text settle. */
export const SUGGESTION_APPLY_SETTLE_MS = 900;

/** Outgoing suggestion card animation duration. */
export const SUGGESTION_CARD_EXIT_MS = 520;

/** Incoming suggestion card animation duration. */
export const SUGGESTION_CARD_ENTER_MS = 560;

/** After the outgoing card exits, before the next card animates in. */
export const SUGGESTION_NEXT_PREVIEW_DELAY_MS = 700;

/** After the incoming card finishes, before the next inline preview appears. */
export const SUGGESTION_INLINE_REVEAL_DELAY_MS = 450;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function waitForAnimation(
  node: HTMLElement | null,
  fallbackMs: number
): Promise<void> {
  if (!node) return delay(fallbackMs);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      node.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
      resolve();
    };
    const onEnd = (e: AnimationEvent) => {
      if (e.target !== node) return;
      finish();
    };
    const fallback = window.setTimeout(finish, fallbackMs + 100);
    node.addEventListener("animationend", onEnd);
  });
}

/** Double rAF so the browser paints the starting keyframe before animating. */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
