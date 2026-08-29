import { describe, expect, it } from "vitest";
import {
  IMAGE_INLINE_MAX_WIDTH_PX,
  IMAGE_INLINE_MIN_WIDTH_PX,
  clampImageInlineWidth,
} from "./image-inline-dimensions";

describe("clampImageInlineWidth", () => {
  it("clamps to export min and max", () => {
    expect(clampImageInlineWidth(50)).toBe(IMAGE_INLINE_MIN_WIDTH_PX);
    expect(clampImageInlineWidth(800)).toBe(IMAGE_INLINE_MAX_WIDTH_PX);
    expect(clampImageInlineWidth(240)).toBe(240);
  });
});
