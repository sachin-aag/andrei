import { describe, expect, it } from "vitest";
import { normalizeErrorText } from "./fingerprint";

describe("normalizeErrorText", () => {
  it("strips report/session ids and the tool-input Value blob", () => {
    const a = normalizeErrorText(
      `chat: assistant stream error { reportId: 'i5hpsr8nwcmyp1dxn48dm97h', sessionId: 'ld5cpa7x16o1sa4tqdractiu', error: 'AI_InvalidToolInputError: Invalid input for tool search_documents: Type validation failed: Value: {"limit":20,"queries":["M3-HRS-GN-001"]}. Error message: too_big queries' }`
    );
    const b = normalizeErrorText(
      `chat: assistant stream error { reportId: 'zzzzzzzzzzzzzzzzzzzzzzzzz', sessionId: 'yyyyyyyyyyyyyyyyyyyyyyyyy', error: 'AI_InvalidToolInputError: Invalid input for tool search_documents: Type validation failed: Value: {"limit":20,"queries":["other-id"]}. Error message: too_big queries' }`
    );
    expect(a).toContain("reportid:<id>");
    expect(a).toContain("sessionid:<id>");
    expect(a).toContain("value:<omitted>");
    expect(a).not.toContain("i5hpsr8nwcmyp1dxn48dm97h");
    expect(a).toBe(b);
  });
});
