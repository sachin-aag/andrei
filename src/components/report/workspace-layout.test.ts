import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allocateWorkspaceColumns,
  bindWorkspaceLayoutToReport,
  CHAT_DEFAULT_PX,
  chatWidthBounds,
  COLLAPSED_RAIL_PX,
  defaultWorkspaceLayout,
  DOCS_DEFAULT_PX,
  docsWidthBounds,
  getWorkspaceLayoutServerSnapshot,
  getWorkspaceLayoutSnapshot,
  isReviewGutterVisible,
  mainMinWidth,
  parseStoredWorkspaceLayout,
  PREVIEW_DEFAULT_PX,
  previewWidthBounds,
  documentCanvasWidthClass,
  REVIEW_GUTTER_GRID_COLS,
  REVIEW_GUTTER_MAX_PX,
  REVIEW_GUTTER_MIN_PX,
  resetWorkspaceLayoutStore,
  serializeStoredWorkspaceLayout,
  updateWorkspaceLayout,
  WORKSPACE_LAYOUT_STORAGE_KEY,
} from "./workspace-layout";

describe("chatWidthBounds", () => {
  it("keeps chat usable on a 1280px laptop", () => {
    const { min, max } = chatWidthBounds(1280);
    expect(min).toBe(280);
    expect(max).toBe(704);
    expect(CHAT_DEFAULT_PX).toBeGreaterThanOrEqual(min);
    expect(CHAT_DEFAULT_PX).toBeLessThanOrEqual(max);
  });

  it("raises the floor and allows a wider chat on a 1920px display", () => {
    const laptop = chatWidthBounds(1280);
    const desktop = chatWidthBounds(1920);
    expect(desktop.min).toBeGreaterThan(laptop.min);
    expect(desktop.max).toBeGreaterThan(laptop.max);
    expect(desktop.max).toBe(960);
    expect(desktop.min).toBe(360);
  });

  it("caps max on a short 1024px window so the document still fits", () => {
    const { min, max } = chatWidthBounds(1024);
    expect(min).toBe(280);
    expect(max).toBe(563);
  });
});

describe("previewWidthBounds", () => {
  it("keeps the work-product column usable on a 1280px laptop", () => {
    const { min, max } = previewWidthBounds(1280);
    expect(min).toBe(320);
    expect(max).toBe(704);
    expect(PREVIEW_DEFAULT_PX).toBeGreaterThanOrEqual(min);
    expect(PREVIEW_DEFAULT_PX).toBeLessThanOrEqual(max);
  });

  it("allows a 960px work-product column on a 1920px display", () => {
    expect(previewWidthBounds(1920).max).toBe(960);
    expect(previewWidthBounds(1920).min).toBe(400);
  });
});

describe("docsWidthBounds", () => {
  it("lets the attachments bar shrink below the 300px default", () => {
    const { min, max } = docsWidthBounds(1280);
    expect(min).toBe(200);
    expect(max).toBeGreaterThanOrEqual(DOCS_DEFAULT_PX);
    expect(max).toBe(358);
  });

  it("allows a wider attachments bar on a large display", () => {
    expect(docsWidthBounds(1920).max).toBe(480);
    expect(docsWidthBounds(1920).min).toBe(230);
  });
});

describe("isReviewGutterVisible", () => {
  it("hides the review margin by default until comments are enabled", () => {
    expect(isReviewGutterVisible(false, true)).toBe(false);
    expect(isReviewGutterVisible(false, false)).toBe(false);
    expect(isReviewGutterVisible(true, true)).toBe(true);
    expect(isReviewGutterVisible(true, false)).toBe(false);
  });

  it("hides the review margin while a PDF or Word document is open", () => {
    expect(isReviewGutterVisible(true, true, true)).toBe(false);
    expect(isReviewGutterVisible(true, false, true)).toBe(false);
    expect(isReviewGutterVisible(true, true, false)).toBe(true);
  });
});

describe("review gutter width", () => {
  it("keeps the margin column narrower than the old 200–360px range", () => {
    expect(REVIEW_GUTTER_MIN_PX).toBeLessThan(200);
    expect(REVIEW_GUTTER_MAX_PX).toBeLessThan(360);
    expect(REVIEW_GUTTER_GRID_COLS).toContain(`${REVIEW_GUTTER_MIN_PX}px`);
    expect(REVIEW_GUTTER_GRID_COLS).toContain(`${REVIEW_GUTTER_MAX_PX}px`);
  });

  it("caps the document column so the gutter does not stretch the prose", () => {
    expect(REVIEW_GUTTER_GRID_COLS).toContain("minmax(0,48rem)");
  });
});

describe("documentCanvasWidthClass", () => {
  it("caps sectioned reports at a readable 48rem sheet", () => {
    expect(
      documentCanvasWidthClass({
        continuousDocument: false,
        reviewGutterVisible: false,
      })
    ).toBe("max-w-3xl px-6 py-8");
  });

  it("widens only enough to sit the review margin beside the sheet", () => {
    const classes = documentCanvasWidthClass({
      continuousDocument: false,
      reviewGutterVisible: true,
    });
    expect(classes).toContain("48rem");
    expect(classes).toContain(`${REVIEW_GUTTER_MAX_PX}px`);
    expect(classes).not.toContain("1180px");
  });

  it("lets generic Letter pages set their own 8.5in width", () => {
    expect(
      documentCanvasWidthClass({
        continuousDocument: true,
        reviewGutterVisible: false,
      })
    ).toBe("max-w-none px-4 py-6");
  });
});

describe("mainMinWidth", () => {
  it("holds a 360px document floor on typical laptops", () => {
    expect(mainMinWidth(1280)).toBe(360);
  });

  it("asks for more document room on a wide display", () => {
    expect(mainMinWidth(1920)).toBe(420);
  });
});

describe("allocateWorkspaceColumns", () => {
  const laptop = {
    viewport: 1280,
    // Collapsed app nav (56px) leaves this for the report workspace.
    container: 1224,
  };

  it("keeps defaults on a 1280px laptop with both panels open", () => {
    const allocated = allocateWorkspaceColumns(laptop.container, laptop.viewport, {
      chatWidth: CHAT_DEFAULT_PX,
      docsWidth: DOCS_DEFAULT_PX,
      chatCollapsed: false,
      docsCollapsed: false,
    });
    expect(allocated.chatWidth).toBe(400);
    expect(allocated.docsWidth).toBe(300);
    expect(allocated.mainWidth).toBe(524);
  });

  it("uses collapsed rails instead of stored widths", () => {
    const allocated = allocateWorkspaceColumns(laptop.container, laptop.viewport, {
      chatWidth: 720,
      docsWidth: 480,
      chatCollapsed: true,
      docsCollapsed: true,
    });
    expect(allocated.chatWidth).toBe(COLLAPSED_RAIL_PX);
    expect(allocated.docsWidth).toBe(COLLAPSED_RAIL_PX);
    expect(allocated.mainWidth).toBe(laptop.container - COLLAPSED_RAIL_PX * 2);
  });

  it("lets chat grow by shrinking the document first", () => {
    const allocated = allocateWorkspaceColumns(
      laptop.container,
      laptop.viewport,
      {
        chatWidth: 500,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "chat"
    );
    expect(allocated.chatWidth).toBe(500);
    expect(allocated.docsWidth).toBe(300);
    expect(allocated.mainWidth).toBe(424);
  });

  it("shrinks documents once the document canvas hits its floor", () => {
    const allocated = allocateWorkspaceColumns(
      1100,
      laptop.viewport,
      {
        chatWidth: 538,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "chat"
    );
    expect(allocated.chatWidth).toBe(538);
    expect(allocated.docsWidth).toBeLessThan(300);
    expect(allocated.docsWidth).toBeGreaterThanOrEqual(200);
    expect(allocated.mainWidth).toBeGreaterThanOrEqual(360);
    expect(allocated.chatWidth + allocated.docsWidth + allocated.mainWidth).toBe(
      1100
    );
  });

  it("will not grow chat past the viewport max", () => {
    const allocated = allocateWorkspaceColumns(
      1800,
      1920,
      {
        chatWidth: 2000,
        docsWidth: 200,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "chat"
    );
    expect(allocated.chatWidth).toBe(chatWidthBounds(1920).max);
  });

  it("will not shrink chat below the viewport min", () => {
    const allocated = allocateWorkspaceColumns(
      laptop.container,
      laptop.viewport,
      {
        chatWidth: 100,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "chat"
    );
    expect(allocated.chatWidth).toBe(chatWidthBounds(laptop.viewport).min);
  });

  it("protects documents when the attachments bar is the one being dragged", () => {
    const allocated = allocateWorkspaceColumns(
      1000,
      laptop.viewport,
      {
        chatWidth: 400,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "docs"
    );
    expect(allocated.docsWidth).toBe(300);
    expect(allocated.chatWidth).toBeLessThan(400);
    expect(allocated.mainWidth).toBeGreaterThanOrEqual(mainMinWidth(laptop.viewport));
  });

  it("shares shrink across both panels on a window resize", () => {
    const allocated = allocateWorkspaceColumns(
      900,
      laptop.viewport,
      {
        chatWidth: 400,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "none"
    );
    expect(allocated.chatWidth).toBeLessThan(400);
    expect(allocated.docsWidth).toBeLessThan(300);
    expect(allocated.chatWidth).toBeGreaterThanOrEqual(
      chatWidthBounds(laptop.viewport).min
    );
    expect(allocated.docsWidth).toBeGreaterThanOrEqual(
      docsWidthBounds(laptop.viewport).min
    );
    expect(allocated.mainWidth).toBeGreaterThanOrEqual(mainMinWidth(laptop.viewport));
  });

  it("restores the preferred chat width when the window grows again", () => {
    const cramped = allocateWorkspaceColumns(
      900,
      laptop.viewport,
      {
        chatWidth: 400,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "none"
    );
    expect(cramped.chatWidth).toBeLessThan(400);

    const restored = allocateWorkspaceColumns(
      laptop.container,
      laptop.viewport,
      {
        chatWidth: 400,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "none"
    );
    expect(restored.chatWidth).toBe(400);
    expect(restored.docsWidth).toBe(300);
  });

  it("sizes the work-product column and leaves leftover to chat in agent chrome", () => {
    const allocated = allocateWorkspaceColumns(
      laptop.container,
      laptop.viewport,
      {
        chrome: "agent",
        chatWidth: 400,
        docsWidth: 300,
        previewWidth: 480,
        chatCollapsed: false,
        docsCollapsed: false,
      }
    );
    expect(allocated.docsWidth).toBe(300);
    expect(allocated.previewWidth).toBe(480);
    expect(allocated.chatWidth).toBe(laptop.container - 300 - 480);
    expect(allocated.mainWidth).toBe(480);
  });

  it("clamps the work-product column to preview bounds in agent chrome", () => {
    const allocated = allocateWorkspaceColumns(
      laptop.container,
      laptop.viewport,
      {
        chrome: "agent",
        chatWidth: 400,
        docsWidth: 300,
        previewWidth: 2000,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "preview"
    );
    expect(allocated.previewWidth).toBeLessThanOrEqual(
      previewWidthBounds(laptop.viewport).max
    );
    expect(allocated.previewWidth).toBeGreaterThanOrEqual(
      previewWidthBounds(laptop.viewport).min
    );
    expect(allocated.chatWidth).toBeGreaterThanOrEqual(
      chatWidthBounds(laptop.viewport).min
    );
  });

  it("uses a collapsed work-product rail in agent chrome when preview is collapsed", () => {
    const allocated = allocateWorkspaceColumns(
      laptop.container,
      laptop.viewport,
      {
        chrome: "agent",
        chatWidth: 400,
        docsWidth: 300,
        previewWidth: 480,
        chatCollapsed: false,
        docsCollapsed: false,
        previewCollapsed: true,
      }
    );
    expect(allocated.previewWidth).toBe(COLLAPSED_RAIL_PX);
    expect(allocated.chatWidth).toBe(laptop.container - 300 - COLLAPSED_RAIL_PX);
    expect(allocated.mainWidth).toBe(COLLAPSED_RAIL_PX);
  });

  it("protects the work-product column when it is the panel being dragged", () => {
    const allocated = allocateWorkspaceColumns(
      1000,
      laptop.viewport,
      {
        chrome: "agent",
        chatWidth: 400,
        docsWidth: 300,
        previewWidth: 480,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "preview"
    );
    expect(allocated.previewWidth).toBe(480);
    expect(allocated.docsWidth).toBeLessThan(300);
    expect(allocated.chatWidth).toBeGreaterThanOrEqual(
      chatWidthBounds(laptop.viewport).min
    );
  });
});

describe("session workspace layout", () => {
  beforeEach(() => {
    resetWorkspaceLayoutStore();
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetWorkspaceLayoutStore();
  });

  it("ignores leftover profile storage and starts at defaults", () => {
    localStorage.setItem(
      WORKSPACE_LAYOUT_STORAGE_KEY,
      serializeStoredWorkspaceLayout({
        chatWidth: 720,
        docsWidth: 480,
        previewWidth: 480,
      })
    );
    bindWorkspaceLayoutToReport("report-a");
    expect(getWorkspaceLayoutSnapshot()).toEqual(defaultWorkspaceLayout());
    expect(localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toBeNull();
  });

  it("keeps a drag on the same report", () => {
    bindWorkspaceLayoutToReport("report-a");
    updateWorkspaceLayout((prev) => ({ ...prev, chatWidth: 512 }));
    bindWorkspaceLayoutToReport("report-a");
    expect(getWorkspaceLayoutSnapshot().chatWidth).toBe(512);
  });

  it("resets to defaults when a different report is opened", () => {
    bindWorkspaceLayoutToReport("report-a");
    updateWorkspaceLayout((prev) => ({ ...prev, chatWidth: 512 }));
    bindWorkspaceLayoutToReport("report-b");
    expect(getWorkspaceLayoutSnapshot()).toEqual(defaultWorkspaceLayout());
  });

  it("caches getServerSnapshot so React 19 hydration does not loop", () => {
    expect(getWorkspaceLayoutServerSnapshot()).toBe(
      getWorkspaceLayoutServerSnapshot()
    );
  });

  it("uses the same default reference on the client before a drag", () => {
    expect(getWorkspaceLayoutSnapshot()).toBe(getWorkspaceLayoutServerSnapshot());
    bindWorkspaceLayoutToReport("report-a");
    expect(getWorkspaceLayoutSnapshot()).toBe(getWorkspaceLayoutServerSnapshot());
  });
});

describe("stored workspace layout", () => {
  it("round-trips finite widths", () => {
    const raw = serializeStoredWorkspaceLayout({
      chatWidth: 512.4,
      docsWidth: 280.9,
      previewWidth: 480.2,
    });
    expect(parseStoredWorkspaceLayout(raw)).toEqual({
      chatWidth: 512,
      docsWidth: 281,
      previewWidth: 480,
    });
  });

  it("rejects missing, non-numeric, or garbage values", () => {
    expect(parseStoredWorkspaceLayout(null)).toBeNull();
    expect(parseStoredWorkspaceLayout("not-json")).toBeNull();
    expect(parseStoredWorkspaceLayout(JSON.stringify({ chatWidth: 400 }))).toBeNull();
    expect(
      parseStoredWorkspaceLayout(
        JSON.stringify({ chatWidth: "400", docsWidth: 300 })
      )
    ).toBeNull();
    expect(
      parseStoredWorkspaceLayout(
        JSON.stringify({ chatWidth: Number.NaN, docsWidth: 300 })
      )
    ).toBeNull();
  });

  it("fills previewWidth when older stored JSON omitted it", () => {
    expect(
      parseStoredWorkspaceLayout(
        JSON.stringify({ chatWidth: 400, docsWidth: 300 })
      )
    ).toEqual({
      chatWidth: 400,
      docsWidth: 300,
      previewWidth: PREVIEW_DEFAULT_PX,
    });
  });
});
