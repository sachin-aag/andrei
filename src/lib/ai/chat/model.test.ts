import { describe, expect, it } from "vitest";
import { CHAT_EXTRACT_GOOGLE_MODEL_ID, chatPaceConfig } from "./model";
import { DEFAULT_CHAT_PACE, isChatPace } from "./pace";

describe("chat pace config", () => {
  it("defaults to quick", () => {
    expect(DEFAULT_CHAT_PACE).toBe("quick");
  });

  it("runs quick on Flash-Lite with minimal thinking", () => {
    expect(chatPaceConfig("quick")).toEqual({
      modelId: "gemini-3.6-flash-lite",
      thinkingLevel: "minimal",
    });
  });

  it("runs deep on Gemini 3.7 Flash at medium thinking", () => {
    // 3.7 Flash rejects THINKING_LEVEL_MINIMAL (Vertex 400).
    expect(chatPaceConfig("deep")).toEqual({
      modelId: "gemini-3.7-flash",
      thinkingLevel: "medium",
    });
  });

  it("keeps Gemini 3.5 Flash-Lite on parallel page extracts", () => {
    expect(CHAT_EXTRACT_GOOGLE_MODEL_ID).toBe("gemini-3.5-flash-lite");
  });
});

describe("isChatPace", () => {
  it("accepts the two surfaced paces", () => {
    expect(isChatPace("quick")).toBe(true);
    expect(isChatPace("deep")).toBe(true);
  });

  it("rejects anything else, so a bad body field falls back to the default", () => {
    expect(isChatPace("thorough")).toBe(false);
    expect(isChatPace("")).toBe(false);
    expect(isChatPace(undefined)).toBe(false);
    expect(isChatPace(null)).toBe(false);
    expect(isChatPace(2)).toBe(false);
  });
});
