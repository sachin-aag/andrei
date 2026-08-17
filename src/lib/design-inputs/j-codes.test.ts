import { describe, expect, it } from "vitest";
import { J_CODES, requiredConfigsFor, CONFIG } from "./j-codes";
import { EXPECTED } from "./expected-findings";

describe("j-codes", () => {
  it("defines all eight justification codes", () => {
    expect(Object.keys(J_CODES).sort()).toEqual([
      "J1",
      "J2",
      "J3",
      "J4",
      "J5",
      "J6",
      "J7",
      "J8",
    ]);
  });

  it("maps J5–J8 to the configs the audit needs", () => {
    expect(requiredConfigsFor("J5")).toEqual([
      CONFIG.TOP_00017_PCON,
      CONFIG.TOP_00051,
    ]);
    expect(requiredConfigsFor("J6")).toEqual([CONFIG.TOP_00017_PCON]);
    expect(requiredConfigsFor("J7")).toEqual([
      CONFIG.TOP_00017_LCD2,
      CONFIG.TOP_00017_PCON,
      CONFIG.TOP_00051,
    ]);
    expect(requiredConfigsFor("J8")).toEqual([CONFIG.TOP_00017_PCON]);
  });
});

describe("expected-findings oracle", () => {
  it("pins the A1 six and C-series dispositions", () => {
    expect(EXPECTED.declaredButUntested).toHaveLength(6);
    expect(EXPECTED.jCodeConflicts.map((c) => c.id)).toEqual([
      "SW-SIB-4",
      "SW-WLP-10.2",
      "SW-LWB-4",
      "SW-SIB-3",
    ]);
    expect(EXPECTED.parsedIds).toBe(619);
    expect(EXPECTED.live).toBe(503);
  });
});
