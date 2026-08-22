import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentDonePrefsStorageKey,
  DEFAULT_AGENT_DONE_PREFS,
  parseAgentDonePrefs,
  readAgentDonePrefs,
  resetAgentDonePrefsStore,
  writeAgentDonePrefs,
} from "./agent-done-prefs";

describe("parseAgentDonePrefs", () => {
  it("accepts the two independent knobs", () => {
    expect(
      parseAgentDonePrefs({ notifications: false, sound: true })
    ).toEqual({ notifications: false, sound: true });
  });

  it("rejects missing, unknown, or garbage values", () => {
    expect(parseAgentDonePrefs(null)).toBeNull();
    expect(parseAgentDonePrefs("silent")).toBeNull();
    expect(parseAgentDonePrefs({ notifications: true })).toBeNull();
    expect(parseAgentDonePrefs({ sound: false })).toBeNull();
    expect(
      parseAgentDonePrefs({ notifications: "yes", sound: false })
    ).toBeNull();
  });
});

describe("agent-done prefs store", () => {
  beforeEach(() => {
    resetAgentDonePrefsStore();
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
    resetAgentDonePrefsStore();
  });

  it("defaults to silent notifications (on) with sound off", () => {
    expect(readAgentDonePrefs("user-a")).toEqual(DEFAULT_AGENT_DONE_PREFS);
    expect(DEFAULT_AGENT_DONE_PREFS).toEqual({
      notifications: true,
      sound: false,
    });
  });

  it("round-trips independent knobs for the same user", () => {
    writeAgentDonePrefs("user-a", { notifications: false, sound: true });
    resetAgentDonePrefsStore();
    expect(readAgentDonePrefs("user-a")).toEqual({
      notifications: false,
      sound: true,
    });
  });

  it("isolates prefs per user", () => {
    writeAgentDonePrefs("user-a", { notifications: false, sound: true });
    expect(readAgentDonePrefs("user-b")).toEqual(DEFAULT_AGENT_DONE_PREFS);
    expect(
      localStorage.getItem(agentDonePrefsStorageKey("user-a"))
    ).toBe(JSON.stringify({ notifications: false, sound: true }));
  });

  it("falls back to defaults when stored JSON is corrupt", () => {
    localStorage.setItem(agentDonePrefsStorageKey("user-a"), "{not-json");
    expect(readAgentDonePrefs("user-a")).toEqual(DEFAULT_AGENT_DONE_PREFS);
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
    writeAgentDonePrefs("user-a", { notifications: false, sound: true });
    expect(readAgentDonePrefs("user-a")).toEqual({
      notifications: false,
      sound: true,
    });
  });
});
