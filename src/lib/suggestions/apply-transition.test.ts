import { describe, expect, it } from "vitest";
import { isBulkSuggestionApply } from "./apply-transition";

describe("isBulkSuggestionApply", () => {
  it("is true only for the bulk hold — not the single-card settle", () => {
    expect(isBulkSuggestionApply("bulk")).toBe(true);
    expect(isBulkSuggestionApply("accept")).toBe(false);
    expect(isBulkSuggestionApply("dismiss")).toBe(false);
    expect(isBulkSuggestionApply(undefined)).toBe(false);
  });
});
