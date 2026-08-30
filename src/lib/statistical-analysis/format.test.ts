import { describe, expect, it } from "vitest";
import {
  formatCapabilityStat,
  formatSpecSummary,
  formatStat,
} from "./format";

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

describe("formatCapabilityStat", () => {
  it("rounds process stats to three decimal places", () => {
    expect(formatCapabilityStat(2.6396)).toBe("2.640");
    expect(formatCapabilityStat(1.0417)).toBe("1.042");
    expect(formatCapabilityStat(17.7586)).toBe("17.759");
  });

  it("keeps missing values as a star", () => {
    expect(formatCapabilityStat(null)).toBe("*");
    expect(formatStat(null)).toBe("*");
  });
});

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
