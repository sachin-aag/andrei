import { describe, expect, it } from "vitest";
import {
  packGutterAnchors,
  rectIntersectsViewport,
  SUGGESTION_FIELD_CENTER_MAX_PX,
  suggestionAnchorY,
  suggestionFieldGutterLayout,
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

describe("suggestionFieldGutterLayout", () => {
  it("centers a compact field on the card", () => {
    expect(
      suggestionFieldGutterLayout({ top: 400, height: 48 }, 100)
    ).toEqual({ desiredTop: 324, valignCenter: true });
  });

  it("pins a tall redraft field to its first line, not the midpoint", () => {
    const field = { top: 400, height: 2400 };
    expect(field.height).toBeGreaterThan(SUGGESTION_FIELD_CENTER_MAX_PX);
    expect(suggestionFieldGutterLayout(field, 100)).toEqual({
      desiredTop: suggestionAnchorY(400, 100),
      valignCenter: false,
    });
  });
});

describe("packGutterAnchors", () => {
  it("does not let an earlier section's tall card push a later section off its field", () => {
    const packed = packGutterAnchors(
      [
        { id: "suggestion:purpose_scope", section: "purpose_scope", desiredTop: 100 },
        { id: "suggestion:deviations", section: "deviations", desiredTop: 800 },
      ],
      {
        "suggestion:purpose_scope": 500,
        "suggestion:deviations": 400,
      }
    );
    const deviations = packed.find((a) => a.id === "suggestion:deviations");
    expect(deviations?.top).toBe(800);
  });

  it("still stacks overlapping cards inside the same section", () => {
    const packed = packGutterAnchors(
      [
        { id: "composer:deviations", section: "deviations", desiredTop: 800 },
        { id: "suggestion:deviations", section: "deviations", desiredTop: 820 },
      ],
      {
        "composer:deviations": 80,
        "suggestion:deviations": 400,
      },
      8
    );
    const suggestion = packed.find((a) => a.id === "suggestion:deviations");
    expect(suggestion?.top).toBe(800 + 80 + 8);
  });
});
