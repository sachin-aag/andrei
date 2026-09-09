import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canvasTabScrollStorageKey,
  parseCanvasTabScrollMap,
  readCanvasTabScrollTop,
  resetCanvasTabScrollStore,
  writeCanvasTabScrollTop,
} from "./canvas-tab-scroll";

describe("canvas tab scroll store", () => {
  beforeEach(() => {
    resetCanvasTabScrollStore();
    const map = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
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
    resetCanvasTabScrollStore();
  });

  it("returns null when nothing is stored", () => {
    expect(readCanvasTabScrollTop("user-a", "report-a", "report")).toBeNull();
  });

  it("round-trips a position after a store reset in the same session", () => {
    writeCanvasTabScrollTop("user-a", "report-a", "report", 480);
    resetCanvasTabScrollStore();
    expect(readCanvasTabScrollTop("user-a", "report-a", "report")).toBe(480);
  });

  it("isolates positions per user, report, and tab", () => {
    writeCanvasTabScrollTop("user-a", "report-a", "report", 120);
    writeCanvasTabScrollTop("user-a", "report-a", "analytics", 40);
    expect(readCanvasTabScrollTop("user-b", "report-a", "report")).toBeNull();
    expect(readCanvasTabScrollTop("user-a", "report-b", "report")).toBeNull();
    expect(readCanvasTabScrollTop("user-a", "report-a", "history")).toBeNull();
    expect(
      sessionStorage.getItem(canvasTabScrollStorageKey("user-a", "report-a"))
    ).toBe(JSON.stringify({ report: 120, analytics: 40 }));
  });

  it("keeps the in-memory position when sessionStorage throws", () => {
    writeCanvasTabScrollTop("user-a", "report-a", "report", 90);
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(readCanvasTabScrollTop("user-a", "report-a", "report")).toBe(90);
  });
});

describe("parseCanvasTabScrollMap", () => {
  it("keeps finite non-negative scroll offsets", () => {
    expect(parseCanvasTabScrollMap('{"report": 12.4, "analytics": 0}')).toEqual({
      report: 12,
      analytics: 0,
    });
  });

  it("drops invalid payloads", () => {
    expect(parseCanvasTabScrollMap("not-json")).toEqual({});
    expect(parseCanvasTabScrollMap('{"report": -4}')).toEqual({});
    expect(parseCanvasTabScrollMap('{"report": "up"}')).toEqual({});
    expect(parseCanvasTabScrollMap("[]")).toEqual({});
  });
});
