import type { CanvasTabId } from "./work-product-canvas";

/** Native drag payload for moving a work-product tab between panes. */
export const CANVAS_TAB_DRAG_MIME = "application/x-andrei-canvas-tab";

export function writeCanvasTabDrag(paneId: string, tabId: CanvasTabId): string {
  return JSON.stringify({ paneId, tabId });
}

export function readCanvasTabDrag(
  raw: string
): { paneId: string; tabId: CanvasTabId } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { paneId?: unknown; tabId?: unknown };
    if (typeof parsed.paneId !== "string" || parsed.paneId.length === 0) {
      return null;
    }
    if (typeof parsed.tabId !== "string" || parsed.tabId.length === 0) {
      return null;
    }
    return { paneId: parsed.paneId, tabId: parsed.tabId as CanvasTabId };
  } catch {
    return null;
  }
}
