import { describe, expect, it } from "vitest";
import {
  P1_PUW_COMBINED_TRANSCRIPT,
  P1_PUW_CONDUCTIVITY_ROWS,
  P1_PUW_PAGE1_TRANSCRIPT,
  P1_PUW_TOC_ROWS,
} from "@/lib/extraction/__fixtures__/p1-puw-qualification-phase-ii";
import { M3_SYS_FN_037_TRANSCRIPT } from "@/lib/charts/__fixtures__/m3-sys-fn-037-transcript";
import {
  AMBIGUOUS_METRIC_REQUEST_MESSAGE,
  alignExtractedDates,
  assayLabelsInText,
  datesAlignedToNumericRows,
  gateMetricSeriesExtract,
  isAmbiguousMetricRequest,
  isUnboundDualSeriesPage,
} from "./metric-series";

describe("assayLabelsInText", () => {
  it("finds conductivity and TOC on the water qualification pages", () => {
    expect(assayLabelsInText(P1_PUW_COMBINED_TRANSCRIPT)).toEqual([
      "Conductivity",
      "TOC",
    ]);
  });
});

describe("isAmbiguousMetricRequest", () => {
  it("rejects the incident hint that named two assays", () => {
    expect(
      isAmbiguousMetricRequest("Conductivity or TOC or Level")
    ).toBe(true);
  });

  it("allows a single named series", () => {
    expect(isAmbiguousMetricRequest("Conductivity")).toBe(false);
    expect(isAmbiguousMetricRequest("TOC")).toBe(false);
    expect(isAmbiguousMetricRequest("Assay % in Table 2")).toBe(false);
    expect(isAmbiguousMetricRequest("M3-SYS-FN-037")).toBe(false);
  });
});

describe("isUnboundDualSeriesPage", () => {
  it("flags the water PDF unlabeled RESULT columns", () => {
    expect(isUnboundDualSeriesPage(P1_PUW_PAGE1_TRANSCRIPT)).toBe(true);
    expect(isUnboundDualSeriesPage(P1_PUW_COMBINED_TRANSCRIPT)).toBe(true);
  });

  it("does not flag a single-series torque table", () => {
    expect(isUnboundDualSeriesPage(M3_SYS_FN_037_TRANSCRIPT)).toBe(false);
  });
});

describe("gateMetricSeriesExtract", () => {
  it("fails closed on an OR-list before pages are read", () => {
    const gate = gateMetricSeriesExtract({
      request: "Conductivity or TOC or Level",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe("ambiguous_request");
    expect(gate.message).toBe(AMBIGUOUS_METRIC_REQUEST_MESSAGE);
  });

  it("fails closed when Conductivity is named but headers stay unbound", () => {
    const gate = gateMetricSeriesExtract({
      request: "Conductivity",
      pageText: P1_PUW_COMBINED_TRANSCRIPT,
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.reason).toBe("unbound_page");
    expect(gate.message).toContain("Conductivity");
    expect(gate.message).toContain("TOC");
  });

  it("allows a single-series page with a requirement-id query", () => {
    expect(
      gateMetricSeriesExtract({
        request: "M3-SYS-FN-037",
        pageText: M3_SYS_FN_037_TRANSCRIPT,
      })
    ).toEqual({ ok: true });
  });
});

describe("datesAlignedToNumericRows", () => {
  it("keeps 30.11.2022 for conductivity because that metric has 1.512", () => {
    const dates = datesAlignedToNumericRows(P1_PUW_CONDUCTIVITY_ROWS);
    expect(dates).toHaveLength(15);
    expect(dates).toContain("30.11.2022");
  });

  it("omits 30.11.2022 only for TOC, where that cell is NA", () => {
    const dates = datesAlignedToNumericRows(P1_PUW_TOC_ROWS);
    expect(dates).toHaveLength(14);
    expect(dates).not.toContain("30.11.2022");
    expect(dates[0]).toBe("17.11.2022");
    expect(dates.at(-1)).toBe("01.12.2022");
  });

  it("drops misaligned date arrays rather than pairing the wrong days", () => {
    expect(alignExtractedDates([1, 2], ["17.11.2022"])).toBeNull();
    expect(alignExtractedDates([1, 2], ["a", "b"])).toEqual(["a", "b"]);
  });
});
