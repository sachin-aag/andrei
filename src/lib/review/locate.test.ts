import { describe, expect, it } from "vitest";
import {
  findReviewLocateSpan,
  locateFieldsForMatch,
  resolveQuoteInFields,
  reviewLocateHint,
  reviewLocateScope,
  uniqueAnchorAround,
} from "./locate";

const body =
  "The batch failed release [1]. The retest passed [2].\n\nCitations\n[1] protocol.pdf, p. 4\n[2] retest.pdf, p. 2";

describe("uniqueAnchorAround", () => {
  it("grows a repeated citation marker until the phrase is unique", () => {
    const start = body.indexOf("[1]");
    const anchor = uniqueAnchorAround(body, start, start + 3);
    expect(anchor).toBe("release [1].");
    expect(body.split(anchor!).length - 1).toBe(1);
  });

  it("returns the token itself when it is already unique", () => {
    const start = body.indexOf("retest passed");
    expect(uniqueAnchorAround(body, start, start + "retest passed".length)).toBe(
      "retest passed"
    );
  });

  it("gives up rather than crossing a line", () => {
    const text = "[1]\n[1]";
    expect(uniqueAnchorAround(text, 0, 3)).toBeNull();
  });
});

describe("locateFieldsForMatch + findReviewLocateSpan", () => {
  it("paints the second copy of a marker, not the first", () => {
    const listStart = body.indexOf("[1] protocol");
    const located = locateFieldsForMatch(body, listStart, "[1]");
    const span = findReviewLocateSpan(body, {
      anchor: located.anchorText,
      needle: located.metadata.focusText,
    });
    expect(span).toEqual({ start: listStart, end: listStart + 3 });
  });

  it("trims whitespace around a token so the anchor stays on one line", () => {
    const text = "Limit (ppm)\n\n0.01 ppm is the NMT value";
    const located = locateFieldsForMatch(text, text.indexOf("\n\n0.01"), "\n\n0.01 ppm");
    expect(located.metadata.focusText).toBe("0.01 ppm");
    expect(located.anchorText).toBe("0.01 ppm");
  });

  it("falls back to which copy it is for identical table cells", () => {
    const cells = "Limit\n0.01 ppm\nLimit\n0.01 ppm\nLimit\n0.01 ppm";
    const third = cells.lastIndexOf("0.01 ppm");
    const located = locateFieldsForMatch(cells, third, "0.01 ppm");
    expect(located).toEqual({
      anchorText: "0.01 ppm",
      metadata: { focusText: "0.01 ppm", focusOccurrence: 2 },
    });
    expect(
      findReviewLocateSpan(cells, {
        anchor: located.anchorText,
        needle: located.metadata.focusText,
        occurrence: located.metadata.focusOccurrence,
      })
    ).toEqual({ start: third, end: third + "0.01 ppm".length });
  });

  it("returns null when the anchor no longer matches and the needle repeats", () => {
    expect(
      findReviewLocateSpan(body, { anchor: "edited away [1]", needle: "[1]" })
    ).toBeNull();
  });

  it("paints the anchor itself when there is no inner needle", () => {
    expect(findReviewLocateSpan(body, { anchor: "retest passed", needle: "" })).toEqual({
      start: body.indexOf("retest passed"),
      end: body.indexOf("retest passed") + "retest passed".length,
    });
  });
});

describe("resolveQuoteInFields", () => {
  const fields = [
    { section: "define", contentPath: "narrative", text: "Readings were acceptable to the R&D Engineer." },
    { section: "measure", contentPath: "narrative", text: "Readings were acceptable to the R&D Engineer." },
  ];

  it("finds the quoted passage in the finding's own section", () => {
    expect(
      resolveQuoteInFields(fields, "measure", "“acceptable to the R&D Engineer…”")
    ).toEqual({ contentPath: "narrative", anchorText: "acceptable to the R&D Engineer" });
  });

  it("returns null for a paraphrase", () => {
    expect(resolveQuoteInFields(fields, "measure", "the engineer decides")).toBeNull();
  });
});

describe("reviewLocateScope / reviewLocateHint", () => {
  const exact = {
    section: "measure",
    contentPath: "narrative",
    anchor: "release [1].",
    needle: "[1]",
  };

  it("classifies section, field, and text targets", () => {
    expect(reviewLocateScope({ ...exact, contentPath: null })).toBe("section");
    expect(reviewLocateScope({ ...exact, anchor: "", needle: "" })).toBe("field");
    expect(reviewLocateScope(exact)).toBe("text");
  });

  it("says nothing when the exact text still locates", () => {
    expect(reviewLocateHint(exact, body)).toBeNull();
  });

  it("explains section, field, and edited-text fallbacks", () => {
    expect(reviewLocateHint({ ...exact, contentPath: null }, null)).toMatch(/whole section/);
    expect(reviewLocateHint({ ...exact, anchor: "", needle: "" }, body)).toMatch(
      /more than one place/
    );
    expect(reviewLocateHint(exact, "The text was rewritten [1] and [1].")).toMatch(
      /edited or now appears more than once/
    );
  });
});
