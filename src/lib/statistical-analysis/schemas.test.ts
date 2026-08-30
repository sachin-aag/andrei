import { describe, expect, it } from "vitest";
import { MEASUREMENT_SCATTER, XY_SCATTER } from "./types";
import {
  measurementScatterInputSchema,
  patchAnalyticsBodySchema,
  xyScatterBodySchema,
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

  it("accepts omitted X (1D vs observation index)", () => {
    const parsed = xyScatterInputSchema.parse({
      kind: XY_SCATTER,
      yColumnId: "c2",
    });
    expect(parsed.yColumnId).toBe("c2");
    expect(parsed.xColumnId ?? null).toBeNull();
    expect(parsed.legendColumnId ?? null).toBeNull();
  });

  it("accepts a legend column distinct from X and Y", () => {
    expect(
      xyScatterInputSchema.parse({
        kind: XY_SCATTER,
        xColumnId: "c1",
        yColumnId: "c2",
        legendColumnId: "c3",
      })
    ).toMatchObject({
      xColumnId: "c1",
      yColumnId: "c2",
      legendColumnId: "c3",
    });
  });

  it("rejects legend equal to Y or X", () => {
    expect(
      xyScatterInputSchema.safeParse({
        kind: XY_SCATTER,
        yColumnId: "c1",
        legendColumnId: "c1",
      }).success
    ).toBe(false);
    expect(
      xyScatterInputSchema.safeParse({
        kind: XY_SCATTER,
        xColumnId: "c1",
        yColumnId: "c2",
        legendColumnId: "c1",
      }).success
    ).toBe(false);
  });

  it("accepts a chart type and spec-limit toggle on create and chat body", () => {
    expect(
      xyScatterInputSchema.parse({
        kind: XY_SCATTER,
        yColumnId: "c2",
        mark: "line",
      }).mark
    ).toBe("line");
    expect(
      xyScatterBodySchema.parse({
        yColumnId: "c2",
        mark: "column",
        showSpecLimits: true,
      })
    ).toMatchObject({
      yColumnId: "c2",
      mark: "column",
      showSpecLimits: true,
    });
    expect(
      xyScatterInputSchema.parse({
        kind: XY_SCATTER,
        yColumnId: "c2",
        showSpecLimits: true,
      }).showSpecLimits
    ).toBe(true);
  });

  it("requires yColumnId on create and allows a partial update with analysisId", () => {
    expect(xyScatterBodySchema.safeParse({ mark: "line" }).success).toBe(false);
    expect(
      xyScatterBodySchema.parse({
        analysisId: "plot-1",
        mark: "line",
        showSpecLimits: true,
      })
    ).toMatchObject({
      analysisId: "plot-1",
      mark: "line",
      showSpecLimits: true,
    });
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

  it("keeps optional column citations from an attachment write", () => {
    const worksheet = createEmptyWorksheet();
    worksheet.columns[0]!.citations = [{ attachmentId: "att_1", page: 31 }];
    const parsed = patchAnalyticsBodySchema.parse({ worksheet });
    expect(parsed.worksheet?.columns[0]?.citations).toEqual([
      { attachmentId: "att_1", page: 31 },
    ]);
  });
});
