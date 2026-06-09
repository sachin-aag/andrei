import { describe, expect, it } from "vitest";
import {
  isExactPlaceholderSelection,
  placeholderSpanAtOffset,
} from "./placeholder-at-offset";

describe("placeholder-at-offset", () => {
  const text = "Batch [Lot: <to be filled>] was affected.";

  it("finds placeholder span for cursor inside brackets", () => {
    expect(placeholderSpanAtOffset(text, 8)).toEqual({ from: 6, to: 27 });
  });

  it("returns null outside placeholders", () => {
    expect(placeholderSpanAtOffset(text, 0)).toBeNull();
  });

  it("detects exact placeholder selection", () => {
    expect(isExactPlaceholderSelection(text, 6, 27)).toBe(true);
    expect(isExactPlaceholderSelection(text, 6, 10)).toBe(false);
  });
});
