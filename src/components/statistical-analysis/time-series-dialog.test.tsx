import { describe, expect, it } from "vitest";
import {
  formatBandLines,
  parseBandLines,
} from "./time-series-dialog";

describe("parseBandLines", () => {
  it("reads one band per line as value, lower, upper", () => {
    expect(parseBandLines("800 650 950\n600 480 720").bands).toEqual([
      { when: "800", lsl: 650, usl: 950 },
      { when: "600", lsl: 480, usl: 720 },
    ]);
  });

  it("accepts a hyphenated range and commas", () => {
    expect(parseBandLines("800 650-950\n600,480,720").bands).toEqual([
      { when: "800", lsl: 650, usl: 950 },
      { when: "600", lsl: 480, usl: 720 },
    ]);
  });

  it("keeps a non-numeric selector — a band may key off a timepoint", () => {
    expect(parseBandLines("3M 95 105").bands).toEqual([
      { when: "3M", lsl: 95, usl: 105 },
    ]);
  });

  it("reports a line it could not read instead of dropping it silently", () => {
    const parsed = parseBandLines("800 650 950\n600 only-one");
    expect(parsed.bands).toHaveLength(1);
    expect(parsed.invalid).toEqual(["600 only-one"]);
  });

  it("rejects a lower limit that is not below the upper", () => {
    expect(parseBandLines("800 950 650").invalid).toEqual(["800 950 650"]);
  });

  it("ignores blank lines", () => {
    expect(parseBandLines("\n800 650 950\n\n").bands).toHaveLength(1);
  });

  it("round-trips through the text form", () => {
    const bands = [
      { when: "800", lsl: 650, usl: 950 },
      { when: "500", lsl: 380, usl: 620 },
    ];
    expect(parseBandLines(formatBandLines(bands)).bands).toEqual(bands);
  });
});
