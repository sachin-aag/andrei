import { describe, expect, it } from "vitest";
import {
  axisTickValues,
  formatAxisTick,
  formatTimeAxisTick,
  niceAxisDomain,
  niceNumber,
  paddedExtent,
  xTickAnchor,
} from "./axis-ticks";

describe("niceNumber", () => {
  it("rounds to 1-2-5 magnitudes", () => {
    expect(niceNumber(12.32, false)).toBe(20);
    expect(niceNumber(20 / 6, true)).toBe(5);
    expect(niceNumber(94, false)).toBe(100);
    expect(niceNumber(100 / 6, true)).toBe(20);
  });
});

describe("niceAxisDomain", () => {
  it("snaps a padded histogram x range to round ends", () => {
    const padded = paddedExtent([-14.52, 76.31], 0.02);
    const domain = niceAxisDomain(padded.min, padded.max);
    expect(domain.min).toBe(-20);
    expect(domain.max).toBe(80);
  });

  it("keeps frequency at zero and rounds the top", () => {
    const domain = niceAxisDomain(0, 12.32, { clampMin: 0 });
    expect(domain.min).toBe(0);
    expect(domain.max).toBe(15);
  });
});

describe("axisTickValues", () => {
  it("fills intermediate x labels between the ends", () => {
    expect(axisTickValues(-20, 80, 20)).toEqual([-20, 0, 20, 40, 60, 80]);
    expect(axisTickValues(0, 15, 5)).toEqual([0, 5, 10, 15]);
  });
});

describe("formatAxisTick", () => {
  it("drops trailing zeros on integers", () => {
    expect(formatAxisTick(-20)).toBe("-20");
    expect(formatAxisTick(0)).toBe("0");
    expect(formatAxisTick(12.32)).toBe("12.32");
  });
});

describe("xTickAnchor", () => {
  it("pins the first and last labels to the plot edges", () => {
    expect(xTickAnchor(0, 6)).toBe("start");
    expect(xTickAnchor(2, 6)).toBe("middle");
    expect(xTickAnchor(5, 6)).toBe("end");
  });
});

describe("formatTimeAxisTick", () => {
  const at = (iso: string) => Date.parse(iso);

  it("shows the clock inside a single day", () => {
    expect(formatTimeAxisTick(at("2026-05-22T20:59:00Z"), 7 * 60_000)).toBe(
      "20:59"
    );
  });

  it("adds the date once the span crosses a day", () => {
    expect(
      formatTimeAxisTick(at("2026-05-22T20:59:00Z"), 3 * 86_400_000)
    ).toBe("22 May 20:59");
  });

  it("drops the clock over a month", () => {
    expect(
      formatTimeAxisTick(at("2026-05-22T20:59:00Z"), 60 * 86_400_000)
    ).toBe("22 May");
  });

  it("adds the year over a year", () => {
    expect(
      formatTimeAxisTick(at("2026-05-22T20:59:00Z"), 800 * 86_400_000)
    ).toBe("22 May 2026");
  });

  it("reads UTC, so an excursion does not move with the viewer", () => {
    // Instrument stamps are wall-clock readings, not zoned instants.
    expect(formatTimeAxisTick(at("2026-05-22T00:30:00Z"), 60_000)).toBe("00:30");
  });

  it("returns empty for a value that is not a time", () => {
    expect(formatTimeAxisTick(Number.NaN, 60_000)).toBe("");
  });
});
