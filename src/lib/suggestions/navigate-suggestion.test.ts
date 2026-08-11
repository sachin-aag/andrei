import { describe, expect, it } from "vitest";
import {
  rectIntersectsViewport,
  suggestionGutterAnchorId,
} from "@/lib/suggestions/navigate-suggestion";

describe("rectIntersectsViewport", () => {
  it("returns true when the rect overlaps the visible band", () => {
    expect(
      rectIntersectsViewport({ top: 100, bottom: 200 }, 800, 80)
    ).toBe(true);
  });

  it("returns false when the rect is fully above the margin", () => {
    expect(
      rectIntersectsViewport({ top: -200, bottom: 40 }, 800, 80)
    ).toBe(false);
  });

  it("returns false when the rect is fully below the margin", () => {
    expect(
      rectIntersectsViewport({ top: 780, bottom: 900 }, 800, 80)
    ).toBe(false);
  });

  it("treats a tall rect spanning the viewport as in view", () => {
    expect(
      rectIntersectsViewport({ top: -100, bottom: 1000 }, 800, 80)
    ).toBe(true);
  });
});

describe("suggestionGutterAnchorId", () => {
  it("matches margin-gutter packing ids", () => {
    expect(suggestionGutterAnchorId("define")).toBe("suggestion:define");
  });
});
