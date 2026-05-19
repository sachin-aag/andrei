import { describe, expect, it } from "vitest";
import { suggestionEditsPlaceholder } from "./suggestion-placeholder-policy";

describe("suggestion-placeholder-policy", () => {
  it("blocks replacing a placeholder with concrete text", () => {
    expect(
      suggestionEditsPlaceholder({
        anchorText: "per [SOP number: <to be filled>], section",
        deleteText: "[SOP number: <to be filled>]",
        insertText: "SOP/DP/QC/045",
      })
    ).toBe(true);
  });

  it("allows edits that do not touch placeholders", () => {
    expect(
      suggestionEditsPlaceholder({
        anchorText: "On 15/05/2025, during",
        deleteText: "15/05/2025,",
        insertText: "15/05/2025 at approximately [time: <to be filled>] hrs,",
      })
    ).toBe(false);
  });
});
