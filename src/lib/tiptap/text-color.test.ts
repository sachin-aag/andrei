import { describe, expect, it } from "vitest";
import {
  colorFromTextMarks,
  cssColorToWordVal,
  normalizeColorInputValue,
  wordColorValToCss,
} from "@/lib/tiptap/text-color";

describe("text-color conversions", () => {
  it("converts Word color values to CSS hex", () => {
    expect(wordColorValToCss("FF0000")).toBe("#ff0000");
    expect(wordColorValToCss("0070C0")).toBe("#0070c0");
    expect(wordColorValToCss("auto")).toBeUndefined();
    expect(wordColorValToCss("000000")).toBeUndefined();
  });

  it("converts CSS hex to Word color values", () => {
    expect(cssColorToWordVal("#FF0000")).toBe("FF0000");
    expect(cssColorToWordVal("#f00")).toBe("FF0000");
    expect(cssColorToWordVal("#000000")).toBeNull();
    expect(cssColorToWordVal("not-a-color")).toBeNull();
  });

  it("reads color from textStyle marks", () => {
    expect(
      colorFromTextMarks([{ type: "textStyle", attrs: { color: "#FF0000" } }])
    ).toBe("#FF0000");
    expect(colorFromTextMarks([{ type: "bold" }])).toBeUndefined();
  });

  it("normalizes color input values", () => {
    expect(normalizeColorInputValue("#FF0000")).toBe("#ff0000");
    expect(normalizeColorInputValue(undefined)).toBe("#000000");
  });
});
