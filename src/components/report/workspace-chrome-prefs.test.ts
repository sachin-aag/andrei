import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKSPACE_CHROME,
  readWorkspaceChrome,
  resetWorkspaceChromePrefsStore,
  workspaceChromeStorageKey,
  writeWorkspaceChrome,
} from "./workspace-chrome-prefs";

describe("workspace chrome prefs store", () => {
  beforeEach(() => {
    resetWorkspaceChromePrefsStore();
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
    resetWorkspaceChromePrefsStore();
  });

  it("defaults to Document when nothing is stored", () => {
    expect(readWorkspaceChrome("user-a", "report-a")).toBe(
      DEFAULT_WORKSPACE_CHROME
    );
    expect(DEFAULT_WORKSPACE_CHROME).toBe("document");
  });

  it("round-trips Agent for the same user and report after a store reset", () => {
    writeWorkspaceChrome("user-a", "report-a", "agent");
    resetWorkspaceChromePrefsStore();
    expect(readWorkspaceChrome("user-a", "report-a")).toBe("agent");
  });

  it("isolates prefs per user and per report", () => {
    writeWorkspaceChrome("user-a", "report-a", "agent");
    expect(readWorkspaceChrome("user-b", "report-a")).toBe(
      DEFAULT_WORKSPACE_CHROME
    );
    expect(readWorkspaceChrome("user-a", "report-b")).toBe(
      DEFAULT_WORKSPACE_CHROME
    );
    expect(
      localStorage.getItem(workspaceChromeStorageKey("user-a", "report-a"))
    ).toBe("agent");
  });

  it("falls back to Document when stored value is unknown", () => {
    localStorage.setItem(
      workspaceChromeStorageKey("user-a", "report-a"),
      "analytics"
    );
    expect(readWorkspaceChrome("user-a", "report-a")).toBe(
      DEFAULT_WORKSPACE_CHROME
    );
  });

  it("keeps the in-memory choice when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
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
    writeWorkspaceChrome("user-a", "report-a", "agent");
    expect(readWorkspaceChrome("user-a", "report-a")).toBe("agent");
  });
});
