import { describe, expect, it } from "vitest";
import {
  configRowFields,
  formatRowSelection,
  normalizeRowSelection,
} from "./row-selection";

describe("normalizeRowSelection", () => {
  it("defaults to the whole column", () => {
    expect(normalizeRowSelection({})).toEqual({ mode: "all" });
    expect(normalizeRowSelection({ rowStart: null, rowEnd: null })).toEqual({
      mode: "all",
    });
  });

  it("builds an inclusive 1-based range and swaps inverted bounds", () => {
    expect(
      normalizeRowSelection({ rowStart: 3, rowEnd: 12 })
    ).toEqual({ mode: "range", start: 3, end: 12 });
    expect(
      normalizeRowSelection({ rowStart: 12, rowEnd: 3 })
    ).toEqual({ mode: "range", start: 3, end: 12 });
    expect(normalizeRowSelection({ rowStart: 5 })).toEqual({
      mode: "from",
      start: 5,
    });
  });

  it("collapses contiguous row lists into a range", () => {
    expect(
      normalizeRowSelection({ rows: [5, 1, 3, 2, 4, 1] })
    ).toEqual({ mode: "range", start: 1, end: 5 });
  });

  it("keeps sparse row lists in worksheet order", () => {
    expect(normalizeRowSelection({ rows: [8, 2, 5] })).toEqual({
      mode: "rows",
      rows: [2, 5, 8],
    });
  });

  it("prefers an explicit row list over start/end", () => {
    expect(
      normalizeRowSelection({ rows: [1, 3], rowStart: 1, rowEnd: 20 })
    ).toEqual({ mode: "rows", rows: [1, 3] });
  });
});

describe("formatRowSelection", () => {
  it("formats ranges and sparse lists", () => {
    expect(formatRowSelection({ mode: "all" })).toBe("");
    expect(formatRowSelection({ mode: "range", start: 3, end: 12 })).toBe(
      "rows 3–12"
    );
    expect(formatRowSelection({ mode: "range", start: 4, end: 4 })).toBe(
      "rows 4"
    );
    expect(formatRowSelection({ mode: "from", start: 5 })).toBe("from row 5");
    expect(formatRowSelection({ mode: "rows", rows: [1, 3, 8] })).toBe(
      "rows 1, 3, 8"
    );
  });
});

describe("configRowFields", () => {
  it("stores only the fields for that mode", () => {
    expect(configRowFields({ mode: "all" })).toEqual({
      rowStart: null,
      rowEnd: null,
      rows: null,
    });
    expect(configRowFields({ mode: "range", start: 2, end: 9 })).toEqual({
      rowStart: 2,
      rowEnd: 9,
      rows: null,
    });
    expect(configRowFields({ mode: "from", start: 6 })).toEqual({
      rowStart: 6,
      rowEnd: null,
      rows: null,
    });
    expect(configRowFields({ mode: "rows", rows: [1, 4] })).toEqual({
      rowStart: null,
      rowEnd: null,
      rows: [1, 4],
    });
  });
});
