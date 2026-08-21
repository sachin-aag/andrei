import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatComposerPrefsStorageKey,
  coerceChatMode,
  coerceChatPace,
  DEFAULT_CHAT_COMPOSER_PREFS,
  parseChatComposerPrefs,
  readChatComposerPrefs,
  resetChatComposerPrefsStore,
  writeChatComposerPrefs,
} from "./composer-prefs";

describe("parseChatComposerPrefs", () => {
  it("accepts the two composer knobs", () => {
    expect(parseChatComposerPrefs({ mode: "plan", pace: "deep" })).toEqual({
      mode: "plan",
      pace: "deep",
    });
  });

  it("rejects missing, unknown, or garbage values", () => {
    expect(parseChatComposerPrefs(null)).toBeNull();
    expect(parseChatComposerPrefs("deep")).toBeNull();
    expect(parseChatComposerPrefs({ mode: "agent" })).toBeNull();
    expect(parseChatComposerPrefs({ mode: "draft", pace: "quick" })).toBeNull();
    expect(parseChatComposerPrefs({ mode: "agent", pace: "thorough" })).toBeNull();
  });
});

describe("coerceChatMode / coerceChatPace", () => {
  it("keeps valid knobs", () => {
    expect(coerceChatMode("plan")).toBe("plan");
    expect(coerceChatPace("deep")).toBe("deep");
  });

  it("falls back when Radix emits an empty remount value", () => {
    expect(coerceChatMode("")).toBe(DEFAULT_CHAT_COMPOSER_PREFS.mode);
    expect(coerceChatMode("draft")).toBe(DEFAULT_CHAT_COMPOSER_PREFS.mode);
    expect(coerceChatPace("")).toBe(DEFAULT_CHAT_COMPOSER_PREFS.pace);
    expect(coerceChatPace("thorough")).toBe(DEFAULT_CHAT_COMPOSER_PREFS.pace);
  });
});

describe("chat composer prefs store", () => {
  beforeEach(() => {
    resetChatComposerPrefsStore();
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
    resetChatComposerPrefsStore();
  });

  it("defaults to Agent + Quick when nothing is stored", () => {
    expect(readChatComposerPrefs("user-a", "report-a")).toEqual(
      DEFAULT_CHAT_COMPOSER_PREFS
    );
    expect(DEFAULT_CHAT_COMPOSER_PREFS).toEqual({ mode: "agent", pace: "quick" });
  });

  it("round-trips a Deep choice for the same user and report", () => {
    writeChatComposerPrefs("user-a", "report-a", { mode: "agent", pace: "deep" });
    resetChatComposerPrefsStore();
    expect(readChatComposerPrefs("user-a", "report-a")).toEqual({
      mode: "agent",
      pace: "deep",
    });
  });

  it("isolates prefs per user and per report", () => {
    writeChatComposerPrefs("user-a", "report-a", { mode: "plan", pace: "deep" });
    expect(readChatComposerPrefs("user-b", "report-a")).toEqual(
      DEFAULT_CHAT_COMPOSER_PREFS
    );
    expect(readChatComposerPrefs("user-a", "report-b")).toEqual(
      DEFAULT_CHAT_COMPOSER_PREFS
    );
    expect(
      localStorage.getItem(chatComposerPrefsStorageKey("user-a", "report-a"))
    ).toBe(JSON.stringify({ mode: "plan", pace: "deep" }));
  });

  it("falls back to defaults when stored JSON is corrupt", () => {
    localStorage.setItem(
      chatComposerPrefsStorageKey("user-a", "report-a"),
      "{not-json"
    );
    expect(readChatComposerPrefs("user-a", "report-a")).toEqual(
      DEFAULT_CHAT_COMPOSER_PREFS
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
    writeChatComposerPrefs("user-a", "report-a", { mode: "plan", pace: "deep" });
    expect(readChatComposerPrefs("user-a", "report-a")).toEqual({
      mode: "plan",
      pace: "deep",
    });
  });
});
