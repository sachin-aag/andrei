import { describe, expect, it } from "vitest";
import {
  citationSiteOffset,
  mapIndexAfterRemovals,
  markdownTableCellSpan,
} from "./citation-site";

describe("citationSiteOffset", () => {
  it("lands after closing bold markers, not inside **0**", () => {
    const text =
      "Total product scrap or batch loss across all trended themes was **0** units. All 4 technical themes remain open.";
    const factEnd = text.indexOf("0") + 1;
    expect(text.slice(factEnd, factEnd + 8)).toBe("** units");
    const dest = citationSiteOffset(text, factEnd);
    expect(text.slice(dest - 5, dest)).toBe("**0**");
    expect(text.slice(dest, dest + 7)).toBe(" units.");
  });

  it("does not pull a word-end site forward to the period", () => {
    const text = "Total product scrap was **0** units.";
    const afterBold = text.indexOf("**0**") + "**0**".length;
    expect(citationSiteOffset(text, afterBold)).toBe(afterBold);
  });

  it("walks out of the middle of a word", () => {
    const text = "batch loss was zero units.";
    const mid = text.indexOf("units") + 2;
    const dest = citationSiteOffset(text, mid);
    expect(text.slice(dest, dest + 1)).toBe(".");
    expect(text.slice(dest - 5, dest)).toBe("units");
  });

  it("stays inside a markdown table cell after the word", () => {
    const text = [
      "Lead-in sentence.",
      "",
      "| Req | P/F |",
      "| --- | --- |",
      "| R-1 | Pass |",
    ].join("\n");
    const passAt = text.indexOf("Pass");
    const dest = citationSiteOffset(text, passAt + "Pass".length);
    expect(text.slice(dest - 4, dest)).toBe("Pass");
    expect(text.slice(dest, dest + 2).trimStart().startsWith("|")).toBe(true);
    const cell = markdownTableCellSpan(text, passAt);
    expect(cell).not.toBeNull();
    expect(text.slice(cell!.start, cell!.end)).toContain("Pass");
  });
});

describe("mapIndexAfterRemovals", () => {
  it("shifts later indices left by removed length", () => {
    expect(mapIndexAfterRemovals(10, [{ start: 2, end: 5 }])).toBe(7);
  });

  it("clamps an index inside a removal to the hole start", () => {
    expect(mapIndexAfterRemovals(4, [{ start: 2, end: 8 }])).toBe(2);
  });
});
