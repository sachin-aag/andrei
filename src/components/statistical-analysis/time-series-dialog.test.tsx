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

describe("band entry against a condition column", () => {
  it("accepts the four lyophilizer setpoint bands", () => {
    const parsed = parseBandLines(
      "800 650 950\n600 480 720\n500 380 620\n250 200 600"
    );
    expect(parsed.invalid).toEqual([]);
    expect(parsed.bands.map((band) => band.when)).toEqual([
      "800",
      "600",
      "500",
      "250",
    ]);
    // The 250 band is deliberately asymmetric — it is a per-step value from a
    // document, not a formula around the setpoint.
    expect(parsed.bands.at(-1)).toEqual({ when: "250", lsl: 200, usl: 600 });
  });

  it("keeps a decimal selector, since a setpoint column prints 800.0", () => {
    expect(parseBandLines("800.0 650 950").bands).toEqual([
      { when: "800.0", lsl: 650, usl: 950 },
    ]);
  });
});
