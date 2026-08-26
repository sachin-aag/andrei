import { describe, expect, it } from "vitest";
import { formatSpecSummary } from "./format";

describe("formatSpecSummary", () => {
  it("joins present spec limits", () => {
    expect(
      formatSpecSummary({ lsl: 90, usl: 110, target: 100 })
    ).toBe("LSL 90.00 · Target 100.00 · USL 110.00");
  });

  it("omits missing specs", () => {
    expect(formatSpecSummary({ lsl: 90, usl: null, target: null })).toBe(
      "LSL 90.00"
    );
    expect(formatSpecSummary({ lsl: null, usl: null, target: null })).toBe("");
  });
});
