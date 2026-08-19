import { describe, expect, it } from "vitest";
import { CHAT_GOOGLE_MODEL_ID } from "./model";

describe("CHAT_GOOGLE_MODEL_ID", () => {
  it("uses Gemini 3.7 Flash for agentic chat and document review", () => {
    expect(CHAT_GOOGLE_MODEL_ID).toBe("gemini-3.7-flash");
  });
});
