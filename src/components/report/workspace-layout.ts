/**
 * Desktop report workspace column sizes. Chat and documents are independently
 * resizable; the document canvas takes leftover space down to a floor.
 *
 * Bounds mix an absolute px floor/ceiling (so panels stay usable) with a
 * viewport fraction (so a 1280px laptop and a 1920px display get different
 * ranges). Collapsed rails stay a fixed icon strip.
 */

export const COLLAPSED_RAIL_PX = 48;

/** Review margin beside the document canvas (container ≥800px). */
export const REVIEW_GUTTER_MIN_PX = 168;
export const REVIEW_GUTTER_MAX_PX = 280;

/** Tailwind container-query grid when the review margin is visible. */
export const REVIEW_GUTTER_GRID_COLS =
  "@[800px]:grid-cols-[minmax(0,1fr)_minmax(168px,280px)]" as const;

export const CHAT_DEFAULT_PX = 400;
export const DOCS_DEFAULT_PX = 300;

const CHAT_ABS_MIN_PX = 280;
const CHAT_ABS_MAX_PX = 720;
const CHAT_MIN_VIEWPORT_FRACTION = 0.2;
const CHAT_MAX_VIEWPORT_FRACTION = 0.42;
const CHAT_MIN_CAP_PX = 360;
const CHAT_MAX_FLOOR_PX = 420;

const DOCS_ABS_MIN_PX = 200;
const DOCS_ABS_MAX_PX = 480;
const DOCS_MIN_VIEWPORT_FRACTION = 0.12;
const DOCS_MAX_VIEWPORT_FRACTION = 0.28;
const DOCS_MIN_CAP_PX = 240;
const DOCS_MAX_FLOOR_PX = 300;

const MAIN_ABS_MIN_PX = 360;
const MAIN_MIN_VIEWPORT_FRACTION = 0.28;
const MAIN_MIN_CAP_PX = 560;

export const WORKSPACE_LAYOUT_STORAGE_KEY = "workspaceLayout:v1";

export const WORKSPACE_RESIZE_STEP_PX = 16;
export const WORKSPACE_RESIZE_LARGE_STEP_PX = 48;

/** Matches `duration-200` on the documents/assistant column wrappers. */
export const WORKSPACE_PANEL_WIDTH_TRANSITION_MS = 200;

/**
 * Inline suggestions and comments live in the review margin. The gutter is
 * opt-in (`commentsGutterEnabled`) and only mounts while the assistant is
 * collapsed so the two surfaces never compete. Hidden while a PDF/Word preview
 * fills the canvas.
 */
export function isReviewGutterVisible(
  commentsGutterEnabled: boolean,
  chatCollapsed: boolean,
  viewingDocument = false
): boolean {
  return commentsGutterEnabled && chatCollapsed && !viewingDocument;
}

export type PanelWidthBounds = {
  min: number;
  max: number;
};

export type StoredWorkspaceLayout = {
  chatWidth: number;
  docsWidth: number;
};

export type WorkspaceColumnIntent = {
  chatWidth: number;
  docsWidth: number;
  chatCollapsed: boolean;
  docsCollapsed: boolean;
};

export type AllocatedWorkspaceColumns = {
  chatWidth: number;
  docsWidth: number;
  mainWidth: number;
};

export type OverflowProtect = "chat" | "docs" | "none";

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

function shrinkForOverflow(
  chat: number,
  docs: number,
  chatMin: number,
  docsMin: number,
  overflow: number,
  protect: OverflowProtect
): { chat: number; docs: number } {
  if (overflow <= 0) return { chat, docs };

  const extraChat = Math.max(0, chat - chatMin);
  const extraDocs = Math.max(0, docs - docsMin);

  switch (protect) {
    case "chat": {
      const fromDocs = Math.min(overflow, extraDocs);
      docs -= fromDocs;
      overflow -= fromDocs;
      chat -= Math.min(overflow, extraChat);
      return { chat, docs };
    }
    case "docs": {
      const fromChat = Math.min(overflow, extraChat);
      chat -= fromChat;
      overflow -= fromChat;
      docs -= Math.min(overflow, extraDocs);
      return { chat, docs };
    }
    case "none": {
      const extra = extraChat + extraDocs;
      if (extra <= 0) return { chat, docs };
      const takeChat = Math.min(
        extraChat,
        Math.round(overflow * (extraChat / extra))
      );
      chat -= takeChat;
      docs -= Math.min(extraDocs, overflow - takeChat);
      return { chat, docs };
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
  const chatBounds = chatWidthBounds(viewportWidth);
  const docsBounds = docsWidthBounds(viewportWidth);
  const mainMin = mainMinWidth(viewportWidth);

  let chat = desired.chatCollapsed
    ? COLLAPSED_RAIL_PX
    : clamp(desired.chatWidth, chatBounds.min, chatBounds.max);
  let docs = desired.docsCollapsed
    ? COLLAPSED_RAIL_PX
    : clamp(desired.docsWidth, docsBounds.min, docsBounds.max);

  const chatMin = desired.chatCollapsed ? COLLAPSED_RAIL_PX : chatBounds.min;
  const docsMin = desired.docsCollapsed ? COLLAPSED_RAIL_PX : docsBounds.min;

  const overflow = chat + docs + mainMin - containerWidth;
  if (overflow > 0) {
    const next = shrinkForOverflow(
      chat,
      docs,
      chatMin,
      docsMin,
      overflow,
      protect
    );
    chat = next.chat;
    docs = next.docs;
  }

  const mainWidth = Math.max(0, containerWidth - chat - docs);
  return { chatWidth: chat, docsWidth: docs, mainWidth };
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
    return { chatWidth, docsWidth };
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
