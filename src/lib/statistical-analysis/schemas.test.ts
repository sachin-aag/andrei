import { describe, expect, it } from "vitest";
import { MEASUREMENT_SCATTER } from "./types";
import { measurementScatterInputSchema } from "./schemas";

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
