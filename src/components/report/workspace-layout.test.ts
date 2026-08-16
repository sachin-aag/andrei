import { describe, expect, it } from "vitest";
import {
  allocateWorkspaceColumns,
  CHAT_DEFAULT_PX,
  chatWidthBounds,
  COLLAPSED_RAIL_PX,
  DOCS_DEFAULT_PX,
  docsWidthBounds,
  mainMinWidth,
  parseStoredWorkspaceLayout,
  serializeStoredWorkspaceLayout,
} from "./workspace-layout";

describe("chatWidthBounds", () => {
  it("keeps chat usable on a 1280px laptop", () => {
    const { min, max } = chatWidthBounds(1280);
    expect(min).toBe(280);
    expect(max).toBe(538);
    expect(CHAT_DEFAULT_PX).toBeGreaterThanOrEqual(min);
    expect(CHAT_DEFAULT_PX).toBeLessThanOrEqual(max);
  });

  it("raises the floor and allows a wider chat on a 1920px display", () => {
    const laptop = chatWidthBounds(1280);
    const desktop = chatWidthBounds(1920);
    expect(desktop.min).toBeGreaterThan(laptop.min);
    expect(desktop.max).toBeGreaterThan(laptop.max);
    expect(desktop.max).toBe(720);
    expect(desktop.min).toBe(360);
  });

  it("caps max on a short 1024px window so the document still fits", () => {
    const { min, max } = chatWidthBounds(1024);
    expect(min).toBe(280);
    expect(max).toBe(430);
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

describe("mainMinWidth", () => {
  it("holds a 360px document floor on typical laptops", () => {
    expect(mainMinWidth(1280)).toBe(360);
  });

  it("asks for more document room on a wide display", () => {
    expect(mainMinWidth(1920)).toBe(538);
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
      laptop.container,
      laptop.viewport,
      {
        chatWidth: 900,
        docsWidth: 300,
        chatCollapsed: false,
        docsCollapsed: false,
      },
      "chat"
    );
    expect(allocated.chatWidth).toBe(chatWidthBounds(laptop.viewport).max);
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
});

describe("stored workspace layout", () => {
  it("round-trips finite widths", () => {
    const raw = serializeStoredWorkspaceLayout({
      chatWidth: 512.4,
      docsWidth: 280.9,
    });
    expect(parseStoredWorkspaceLayout(raw)).toEqual({
      chatWidth: 512,
      docsWidth: 281,
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
});
