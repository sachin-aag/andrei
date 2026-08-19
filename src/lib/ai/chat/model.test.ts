import { describe, expect, it } from "vitest";
import { CHAT_EXTRACT_GOOGLE_MODEL_ID, CHAT_GOOGLE_MODEL_ID, CHAT_THINKING_LEVEL } from "./model";

describe("chat model ids", () => {
  it("uses Gemini 3.7 Flash for the assistant orchestrator", () => {
    expect(CHAT_GOOGLE_MODEL_ID).toBe("gemini-3.7-flash");
  });

  it("keeps Gemini 3.5 Flash-Lite on parallel page extracts", () => {
    expect(CHAT_EXTRACT_GOOGLE_MODEL_ID).toBe("gemini-3.5-flash-lite");
  });

  it("uses medium thinking on 3.7 Flash until we route by task", () => {
    expect(CHAT_THINKING_LEVEL).toBe("medium");
  });
});
