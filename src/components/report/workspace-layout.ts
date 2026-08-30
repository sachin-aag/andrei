/**
 * Desktop report workspace column sizes. Attachments are independently
 * resizable in both chromes. In document chrome, chat is sized and the
 * work-product canvas takes leftover space. In agent chrome the work-product
 * column is sized and chat takes leftover space.
 *
 * Bounds mix an absolute px floor/ceiling (so panels stay usable) with a
 * viewport fraction (so a 1280px laptop and a 1920px display get different
 * ranges). Collapsed rails stay a fixed icon strip.
 */

import type { CSSProperties } from "react";
import type { WorkspaceChrome } from "./workspace-chrome";

export const COLLAPSED_RAIL_PX = 48;

/** Review margin beside the document canvas. */
export const REVIEW_GUTTER_MIN_PX = 168;
export const REVIEW_GUTTER_MAX_PX = 280;

/**
 * Container-query floor for the review-margin column. Must stay a complete
 * Tailwind class in `REVIEW_GUTTER_GRID_COLS` / `REVIEW_GUTTER_ASIDE_CLASS`.
 *
 * 480px (not 800px) is required on a 1280px laptop: default chat (400) +
 * attachments (300) + collapsed app nav (~56) leave ~520px of canvas. An
 * 800px floor hid the gutter on Playwright’s viewport and on 13" screens
 * even with Comments turned on.
 */
export const REVIEW_GUTTER_CONTAINER_MIN_PX = 480;

/**
 * Review margin beside the document sheet. The sheet keeps `--doc-col`; the
 * margin takes what is left, so widening the sheet shrinks the margin to
 * `REVIEW_GUTTER_MIN_PX` before the sheet itself gives way.
 */
export const REVIEW_GUTTER_GRID_COLS =
  "@[480px]:grid-cols-[minmax(0,var(--doc-col))_minmax(168px,1fr)]" as const;

export const REVIEW_GUTTER_ASIDE_CLASS =
  "relative hidden min-w-0 @[480px]:block" as const;

/**
 * Readable measure for sectioned reports (investigation, DV, QRA).
 * Typographic practice is 45–75 characters per line (WCAG 1.4.8 caps at 80).
 * The default sheet is 880px: wide enough for the two-column 6M grid and
 * wide tables, still far short of an ultrawide canvas. Engineers can drag the
 * sheet edge between these bounds; leftover canvas width becomes side padding.
 */
export const DOCUMENT_WIDTH_DEFAULT_PX = 880;
export const DOCUMENT_WIDTH_MIN_PX = 640;
export const DOCUMENT_WIDTH_MAX_PX = 1280;

/**
 * Fixed bounds — the sheet is centered inside the canvas and CSS clamps it to
 * `min(100%, …)`, so a narrow canvas needs no separate viewport ceiling.
 */
export function documentWidthBounds(): PanelWidthBounds {
  return { min: DOCUMENT_WIDTH_MIN_PX, max: DOCUMENT_WIDTH_MAX_PX };
}

/** Feeds `--doc-col` to the canvas max-width and the review-margin grid. */
export function documentColumnStyle(width: number): CSSProperties {
  const clamped = clamp(
    Math.round(width),
    DOCUMENT_WIDTH_MIN_PX,
    DOCUMENT_WIDTH_MAX_PX
  );
  return { "--doc-col": `${clamped}px` } as CSSProperties;
}

/**
 * Generic documents already lay themselves out as 8.5in pages, so they keep
 * `max-w-none`. Keep these as complete class strings so Tailwind sees them.
 */
export function documentCanvasWidthClass(input: {
  continuousDocument: boolean;
  reviewGutterVisible: boolean;
}): string {
  if (input.continuousDocument) return "max-w-none px-4 py-6";
  if (input.reviewGutterVisible) {
    return "max-w-[min(100%,calc(var(--doc-col)+2rem+280px))] px-6 py-8";
  }
  return "max-w-[min(100%,var(--doc-col))] px-6 py-8";
}

export const CHAT_DEFAULT_PX = 400;
export const DOCS_DEFAULT_PX = 300;
export const PREVIEW_DEFAULT_PX = 480;

const CHAT_ABS_MIN_PX = 280;
const CHAT_ABS_MAX_PX = 960;
const CHAT_MIN_VIEWPORT_FRACTION = 0.2;
const CHAT_MAX_VIEWPORT_FRACTION = 0.55;
const CHAT_MIN_CAP_PX = 360;
const CHAT_MAX_FLOOR_PX = 560;

const DOCS_ABS_MIN_PX = 200;
const DOCS_ABS_MAX_PX = 480;
const DOCS_MIN_VIEWPORT_FRACTION = 0.12;
const DOCS_MAX_VIEWPORT_FRACTION = 0.28;
const DOCS_MIN_CAP_PX = 240;
const DOCS_MAX_FLOOR_PX = 300;

const PREVIEW_ABS_MIN_PX = 320;
const PREVIEW_ABS_MAX_PX = 960;
const PREVIEW_MIN_VIEWPORT_FRACTION = 0.22;
const PREVIEW_MAX_VIEWPORT_FRACTION = 0.55;
const PREVIEW_MIN_CAP_PX = 400;
const PREVIEW_MAX_FLOOR_PX = 480;

const MAIN_ABS_MIN_PX = 360;
const MAIN_MIN_VIEWPORT_FRACTION = 0.28;
const MAIN_MIN_CAP_PX = 420;

export const WORKSPACE_LAYOUT_STORAGE_KEY = "workspaceLayout:v1";

export const WORKSPACE_RESIZE_STEP_PX = 16;
export const WORKSPACE_RESIZE_LARGE_STEP_PX = 48;

/** Matches `duration-200` on the documents/assistant column wrappers. */
export const WORKSPACE_PANEL_WIDTH_TRANSITION_MS = 200;

/**
 * Inline suggestions and comments live in the review margin. The gutter is
 * opt-in via the Comments switch on the Report tab. Hidden while a PDF/Word
 * preview fills the canvas.
 */
export function isReviewGutterVisible(
  commentsGutterEnabled: boolean,
  viewingDocument = false
): boolean {
  return commentsGutterEnabled && !viewingDocument;
}

export type PanelWidthBounds = {
  min: number;
  max: number;
};

export type StoredWorkspaceLayout = {
  chatWidth: number;
  docsWidth: number;
  previewWidth: number;
  documentWidth: number;
};

export type WorkspaceColumnIntent = {
  chrome?: WorkspaceChrome;
  chatWidth: number;
  docsWidth: number;
  previewWidth?: number;
  chatCollapsed: boolean;
  docsCollapsed: boolean;
  previewCollapsed?: boolean;
};

export type AllocatedWorkspaceColumns = {
  chatWidth: number;
  docsWidth: number;
  previewWidth: number;
  mainWidth: number;
};

export type OverflowProtect = "chat" | "docs" | "preview" | "none";

export function clamp(value: number, min: number, max: number): number {
  if (min > max) return min;
  return Math.min(max, Math.max(min, value));
}

function viewportBound(
  viewportWidth: number,
  fraction: number,
  absMin: number,
  absMax: number
): number {
  return clamp(Math.round(viewportWidth * fraction), absMin, absMax);
}

/** Chat min/max for the user's screen. Wider displays raise both ends, capped. */
export function chatWidthBounds(viewportWidth: number): PanelWidthBounds {
  const min = viewportBound(
    viewportWidth,
    CHAT_MIN_VIEWPORT_FRACTION,
    CHAT_ABS_MIN_PX,
    CHAT_MIN_CAP_PX
  );
  const max = viewportBound(
    viewportWidth,
    CHAT_MAX_VIEWPORT_FRACTION,
    CHAT_MAX_FLOOR_PX,
    CHAT_ABS_MAX_PX
  );
  return { min, max: Math.max(min, max) };
}

/** Documents (attachments) min/max for the user's screen. */
export function docsWidthBounds(viewportWidth: number): PanelWidthBounds {
  const min = viewportBound(
    viewportWidth,
    DOCS_MIN_VIEWPORT_FRACTION,
    DOCS_ABS_MIN_PX,
    DOCS_MIN_CAP_PX
  );
  const max = viewportBound(
    viewportWidth,
    DOCS_MAX_VIEWPORT_FRACTION,
    DOCS_MAX_FLOOR_PX,
    DOCS_ABS_MAX_PX
  );
  return { min, max: Math.max(min, max) };
}

/** Document canvas never shrinks below this while both side panels are open. */
export function mainMinWidth(viewportWidth: number): number {
  return viewportBound(
    viewportWidth,
    MAIN_MIN_VIEWPORT_FRACTION,
    MAIN_ABS_MIN_PX,
    MAIN_MIN_CAP_PX
  );
}

/** Work-product column min/max (agent chrome right panel). */
export function previewWidthBounds(viewportWidth: number): PanelWidthBounds {
  const min = viewportBound(
    viewportWidth,
    PREVIEW_MIN_VIEWPORT_FRACTION,
    PREVIEW_ABS_MIN_PX,
    PREVIEW_MIN_CAP_PX
  );
  const max = viewportBound(
    viewportWidth,
    PREVIEW_MAX_VIEWPORT_FRACTION,
    PREVIEW_MAX_FLOOR_PX,
    PREVIEW_ABS_MAX_PX
  );
  return { min, max: Math.max(min, max) };
}

function shrinkTwo(
  a: number,
  b: number,
  aMin: number,
  bMin: number,
  overflow: number,
  protect: "a" | "b" | "none"
): { a: number; b: number } {
  if (overflow <= 0) return { a, b };

  const extraA = Math.max(0, a - aMin);
  const extraB = Math.max(0, b - bMin);

  switch (protect) {
    case "a": {
      const fromB = Math.min(overflow, extraB);
      b -= fromB;
      overflow -= fromB;
      a -= Math.min(overflow, extraA);
      return { a, b };
    }
    case "b": {
      const fromA = Math.min(overflow, extraA);
      a -= fromA;
      overflow -= fromA;
      b -= Math.min(overflow, extraB);
      return { a, b };
    }
    case "none": {
      const extra = extraA + extraB;
      if (extra <= 0) return { a, b };
      const takeA = Math.min(extraA, Math.round(overflow * (extraA / extra)));
      a -= takeA;
      b -= Math.min(extraB, overflow - takeA);
      return { a, b };
    }
    default: {
      const _exhaustive: never = protect;
      return _exhaustive;
    }
  }
}

/**
 * Fit desired panel widths into the workspace. `protect` keeps the panel the
 * user is dragging; window resizes use `"none"` and share leftover shrink.
 */
export function allocateWorkspaceColumns(
  containerWidth: number,
  viewportWidth: number,
  desired: WorkspaceColumnIntent,
  protect: OverflowProtect = "none"
): AllocatedWorkspaceColumns {
  const chrome = desired.chrome ?? "document";
  const chatBounds = chatWidthBounds(viewportWidth);
  const docsBounds = docsWidthBounds(viewportWidth);
  const previewBounds = previewWidthBounds(viewportWidth);
  const mainMin = mainMinWidth(viewportWidth);
  const storedPreview = desired.previewWidth ?? PREVIEW_DEFAULT_PX;

  const docs = desired.docsCollapsed
    ? COLLAPSED_RAIL_PX
    : clamp(desired.docsWidth, docsBounds.min, docsBounds.max);
  const docsMin = desired.docsCollapsed ? COLLAPSED_RAIL_PX : docsBounds.min;
  const previewCollapsed = desired.previewCollapsed ?? false;
  const preview = previewCollapsed
    ? COLLAPSED_RAIL_PX
    : clamp(storedPreview, previewBounds.min, previewBounds.max);
  const previewMin = previewCollapsed ? COLLAPSED_RAIL_PX : previewBounds.min;

  if (chrome === "agent") {
    const chatMin = desired.chatCollapsed ? COLLAPSED_RAIL_PX : chatBounds.min;
    let previewW = preview;
    let docsW = docs;
    const overflow = previewW + docsW + chatMin - containerWidth;
    if (overflow > 0) {
      const side =
        protect === "preview" ? "a" : protect === "docs" ? "b" : "none";
      const next = shrinkTwo(
        previewW,
        docsW,
        previewMin,
        docsMin,
        overflow,
        side
      );
      previewW = next.a;
      docsW = next.b;
    }
    const chatW = desired.chatCollapsed
      ? COLLAPSED_RAIL_PX
      : Math.max(0, containerWidth - previewW - docsW);
    return {
      chatWidth: chatW,
      docsWidth: docsW,
      previewWidth: previewW,
      mainWidth: previewW,
    };
  }

  let chat = desired.chatCollapsed
    ? COLLAPSED_RAIL_PX
    : clamp(desired.chatWidth, chatBounds.min, chatBounds.max);
  let docsW = docs;
  const chatMin = desired.chatCollapsed ? COLLAPSED_RAIL_PX : chatBounds.min;
  const overflow = chat + docsW + mainMin - containerWidth;
  if (overflow > 0) {
    const side = protect === "chat" ? "a" : protect === "docs" ? "b" : "none";
    const next = shrinkTwo(chat, docsW, chatMin, docsMin, overflow, side);
    chat = next.a;
    docsW = next.b;
  }

  return {
    chatWidth: chat,
    docsWidth: docsW,
    previewWidth: preview,
    mainWidth: Math.max(0, containerWidth - chat - docsW),
  };
}

export function parseStoredWorkspaceLayout(
  raw: string | null
): StoredWorkspaceLayout | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const chatWidth = (parsed as { chatWidth?: unknown }).chatWidth;
    const docsWidth = (parsed as { docsWidth?: unknown }).docsWidth;
    if (typeof chatWidth !== "number" || !Number.isFinite(chatWidth)) {
      return null;
    }
    if (typeof docsWidth !== "number" || !Number.isFinite(docsWidth)) {
      return null;
    }
    const previewWidth = (parsed as { previewWidth?: unknown }).previewWidth;
    const documentWidth = (parsed as { documentWidth?: unknown }).documentWidth;
    return {
      chatWidth,
      docsWidth,
      previewWidth:
        typeof previewWidth === "number" && Number.isFinite(previewWidth)
          ? previewWidth
          : PREVIEW_DEFAULT_PX,
      documentWidth:
        typeof documentWidth === "number" && Number.isFinite(documentWidth)
          ? documentWidth
          : DOCUMENT_WIDTH_DEFAULT_PX,
    };
  } catch {
    return null;
  }
}

export function serializeStoredWorkspaceLayout(
  layout: StoredWorkspaceLayout
): string {
  return JSON.stringify({
    chatWidth: Math.round(layout.chatWidth),
    docsWidth: Math.round(layout.docsWidth),
    previewWidth: Math.round(layout.previewWidth),
    documentWidth: Math.round(layout.documentWidth),
  });
}

/**
 * Stable default for `useSyncExternalStore`. React 19 re-reads
 * `getServerSnapshot` during hydration and loops if each call returns a
 * new object (`The result of getServerSnapshot should be cached`).
 */
const DEFAULT_WORKSPACE_LAYOUT: StoredWorkspaceLayout = Object.freeze({
  chatWidth: CHAT_DEFAULT_PX,
  docsWidth: DOCS_DEFAULT_PX,
  previewWidth: PREVIEW_DEFAULT_PX,
  documentWidth: DOCUMENT_WIDTH_DEFAULT_PX,
});

export function defaultWorkspaceLayout(): StoredWorkspaceLayout {
  return { ...DEFAULT_WORKSPACE_LAYOUT };
}

/** Drop leftover profile storage from when panel widths were remembered. */
export function clearStoredWorkspaceLayout(): void {
  try {
    localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
  } catch {
    // Incognito / disabled storage.
  }
}

let boundReportId: string | null = null;
let memoryLayout: StoredWorkspaceLayout | null = null;
const layoutListeners = new Set<() => void>();

function emitLayout(): void {
  layoutListeners.forEach((listener) => listener());
}

/**
 * Panel widths are in-memory for the open report only. Opening another report
 * (or a new login, which remounts) returns to the defaults — not localStorage.
 * Safe to call during render; does not notify subscribers.
 */
export function bindWorkspaceLayoutToReport(reportId: string): void {
  if (boundReportId === reportId) return;
  boundReportId = reportId;
  memoryLayout = DEFAULT_WORKSPACE_LAYOUT;
  clearStoredWorkspaceLayout();
}

/** Test helper — module store otherwise leaks across cases. */
export function resetWorkspaceLayoutStore(): void {
  boundReportId = null;
  memoryLayout = null;
}

export function subscribeWorkspaceLayout(onStoreChange: () => void): () => void {
  layoutListeners.add(onStoreChange);
  return () => {
    layoutListeners.delete(onStoreChange);
  };
}

export function getWorkspaceLayoutSnapshot(): StoredWorkspaceLayout {
  if (memoryLayout) return memoryLayout;
  memoryLayout = DEFAULT_WORKSPACE_LAYOUT;
  return memoryLayout;
}

export function getWorkspaceLayoutServerSnapshot(): StoredWorkspaceLayout {
  return DEFAULT_WORKSPACE_LAYOUT;
}

export function commitWorkspaceLayout(layout: StoredWorkspaceLayout): void {
  memoryLayout = layout;
  emitLayout();
}

export function updateWorkspaceLayout(
  updater: (prev: StoredWorkspaceLayout) => StoredWorkspaceLayout
): void {
  commitWorkspaceLayout(updater(getWorkspaceLayoutSnapshot()));
}

export function subscribeViewportWidth(onStoreChange: () => void): () => void {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}

export function getViewportWidthSnapshot(): number {
  return window.innerWidth;
}

export function getViewportWidthServerSnapshot(): number {
  return 1440;
}
