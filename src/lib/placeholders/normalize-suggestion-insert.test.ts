import { describe, expect, it } from "vitest";
import { MAX_PLACEHOLDER_LABEL_LENGTH } from "./find";
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

  it("compacts long AI placeholder labels under the shared limit", () => {
    const out = normalizeSuggestionInsertText(
      "The affected equipment/system is [Name/ID of Monitoring System or Refrigerator Unit]."
    );
    expect(out).toBe(
      "The affected equipment/system is [Monitoring System or Refrigerator Unit: <to be filled>]."
    );
    const label = out.match(/\[(.+?): <to be filled>\]/)?.[1] ?? "";
    expect(label.length).toBeLessThanOrEqual(MAX_PLACEHOLDER_LABEL_LENGTH);
  });

  it("compacts long labels from angle-bracket form", () => {
    expect(
      normalizeSuggestionInsertText(
        "<to be filled: Name/ID of Monitoring System or Refrigerator Unit>"
      )
    ).toBe("[Monitoring System or Refrigerator Unit: <to be filled>]");
  });
});
