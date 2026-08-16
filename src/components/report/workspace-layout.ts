/**
 * Desktop report workspace column sizes. Chat and documents are independently
 * resizable; the document canvas takes leftover space down to a floor.
 *
 * Bounds mix an absolute px floor/ceiling (so panels stay usable) with a
 * viewport fraction (so a 1280px laptop and a 1920px display get different
 * ranges). Collapsed rails stay a fixed icon strip.
 */

export const COLLAPSED_RAIL_PX = 48;

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

export function readStoredWorkspaceLayout(): StoredWorkspaceLayout | null {
  try {
    return parseStoredWorkspaceLayout(
      localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function writeStoredWorkspaceLayout(
  layout: StoredWorkspaceLayout
): void {
  try {
    localStorage.setItem(
      WORKSPACE_LAYOUT_STORAGE_KEY,
      serializeStoredWorkspaceLayout(layout)
    );
  } catch {
    // Incognito / quota / disabled storage — layout still works for the session.
  }
}

export function defaultWorkspaceLayout(): StoredWorkspaceLayout {
  return { chatWidth: CHAT_DEFAULT_PX, docsWidth: DOCS_DEFAULT_PX };
}

let memoryLayout: StoredWorkspaceLayout | null = null;
const layoutListeners = new Set<() => void>();

function emitLayout(): void {
  layoutListeners.forEach((listener) => listener());
}

function onLayoutStorage(event: StorageEvent): void {
  if (event.key != null && event.key !== WORKSPACE_LAYOUT_STORAGE_KEY) return;
  memoryLayout = parseStoredWorkspaceLayout(event.newValue);
  emitLayout();
}

export function subscribeWorkspaceLayout(onStoreChange: () => void): () => void {
  layoutListeners.add(onStoreChange);
  if (layoutListeners.size === 1) {
    window.addEventListener("storage", onLayoutStorage);
  }
  return () => {
    layoutListeners.delete(onStoreChange);
    if (layoutListeners.size === 0) {
      window.removeEventListener("storage", onLayoutStorage);
    }
  };
}

export function getWorkspaceLayoutSnapshot(): StoredWorkspaceLayout {
  if (memoryLayout) return memoryLayout;
  memoryLayout = readStoredWorkspaceLayout() ?? defaultWorkspaceLayout();
  return memoryLayout;
}

export function getWorkspaceLayoutServerSnapshot(): StoredWorkspaceLayout {
  return defaultWorkspaceLayout();
}

export function commitWorkspaceLayout(
  layout: StoredWorkspaceLayout,
  persist = true
): void {
  memoryLayout = layout;
  if (persist) writeStoredWorkspaceLayout(layout);
  emitLayout();
}

export function updateWorkspaceLayout(
  updater: (prev: StoredWorkspaceLayout) => StoredWorkspaceLayout,
  persist = true
): void {
  commitWorkspaceLayout(updater(getWorkspaceLayoutSnapshot()), persist);
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
