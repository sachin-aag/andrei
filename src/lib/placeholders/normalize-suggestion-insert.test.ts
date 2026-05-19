import { describe, expect, it } from "vitest";
import { normalizeSuggestionInsertText } from "./normalize-suggestion-insert";

describe("normalizeSuggestionInsertText", () => {
  it("converts angle-bracket to-be-filled tokens to bracket placeholders", () => {
    expect(
      normalizeSuggestionInsertText(
        "<to be filled: detection date> at <to be filled>"
      )
    ).toBe(
      "[detection date: <to be filled>] at [<to be filled>]"
    );
  });

  it("normalizes guidance brackets", () => {
    expect(normalizeSuggestionInsertText("see [batch number]")).toBe(
      "see [batch number: <to be filled>]"
    );
  });

  it("does not double-wrap when label already uses bracket form", () => {
    expect(
      normalizeSuggestionInsertText(
        "per SOP [SOP number: <to be filled>], Section [section number: <to be filled>]."
      )
    ).toBe(
      "per SOP [SOP number: <to be filled>], Section [section number: <to be filled>]."
    );
  });

  it("repairs already double-wrapped placeholders", () => {
    expect(
      normalizeSuggestionInsertText("[SOP number: [[<to be filled>]] ]")
    ).toBe("[SOP number: <to be filled>]");
  });
});
