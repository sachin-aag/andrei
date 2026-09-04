import { describe, expect, it } from "vitest";
import {
  axisTickValues,
  formatAxisTick,
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
