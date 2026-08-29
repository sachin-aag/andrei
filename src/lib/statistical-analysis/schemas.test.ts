import { describe, expect, it } from "vitest";
import { MEASUREMENT_SCATTER, XY_SCATTER } from "./types";
import {
  measurementScatterInputSchema,
  patchAnalyticsBodySchema,
  xyScatterInputSchema,
} from "./schemas";
import { createEmptyWorksheet } from "./worksheet";

describe("measurementScatterInputSchema", () => {
  it("allows omitted or null spec limits", () => {
    expect(
      measurementScatterInputSchema.parse({
        kind: MEASUREMENT_SCATTER,
        query: "M3-SYS-FN-037",
      }).lsl
    ).toBeUndefined();
    expect(
      measurementScatterInputSchema.parse({
        kind: MEASUREMENT_SCATTER,
        query: "M3-SYS-FN-037",
        lsl: null,
        usl: 6,
      })
    ).toMatchObject({ lsl: null, usl: 6 });
  });

  it("rejects LSL greater than or equal to USL when both are set", () => {
    const result = measurementScatterInputSchema.safeParse({
      kind: MEASUREMENT_SCATTER,
      query: "M3-SYS-FN-037",
      lsl: 6,
      usl: 1,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(
      "Lower spec must be less than upper spec."
    );
  });
});

describe("xyScatterInputSchema", () => {
  it("rejects the same column for X and Y", () => {
    const result = xyScatterInputSchema.safeParse({
      kind: XY_SCATTER,
      xColumnId: "c1",
      yColumnId: "c1",
    });
    expect(result.success).toBe(false);
  });

  it("accepts distinct columns", () => {
    expect(
      xyScatterInputSchema.parse({
        kind: XY_SCATTER,
        xColumnId: "c1",
        yColumnId: "c2",
      })
    ).toMatchObject({ xColumnId: "c1", yColumnId: "c2" });
  });
});

describe("patchAnalyticsBodySchema", () => {
  it("accepts an optional last-seen version", () => {
    const worksheet = createEmptyWorksheet();
    expect(
      patchAnalyticsBodySchema.parse({ worksheet, version: 2 })
    ).toMatchObject({ version: 2 });
    expect(patchAnalyticsBodySchema.parse({ worksheet }).version).toBeUndefined();
    expect(
      patchAnalyticsBodySchema.safeParse({ worksheet, version: 0 }).success
    ).toBe(false);
  });
});
