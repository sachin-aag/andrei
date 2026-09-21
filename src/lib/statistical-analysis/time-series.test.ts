import { describe, expect, it } from "vitest";
import {
  computeTimeSeries,
  parseTimestampCell,
} from "./time-series";
import {
  MAX_TIME_SERIES_POINTS,
  type TimeSeriesConfig,
  type WorksheetData,
} from "./types";
import { createEmptyWorksheet } from "./worksheet";

function sheetWith(
  columns: Array<{ id: string; name: string; values: string[] }>
): WorksheetData {
  const base = createEmptyWorksheet(columns.length);
  const next = columns.map((column, index) => ({
    ...base.columns[index]!,
    id: column.id,
    name: column.name,
    values: column.values,
  }));
  return {
    ...base,
    columns: next,
    sheets: [{ ...base.sheets[0]!, columns: next }],
  };
}

const SERIES_START = Date.UTC(2026, 4, 22, 20, 55, 11);

/** One reading a minute from 22/05/2026 20:55:11, rolling the date past midnight. */
function minuteStamps(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(SERIES_START + i * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`;
  });
}

/** The dates those stamps belong to, so a long series does not repeat a clock. */
function minuteDates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const at = new Date(SERIES_START + i * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(at.getUTCDate())}/${pad(at.getUTCMonth() + 1)}/${at.getUTCFullYear()}`;
  });
}

function config(over: Partial<TimeSeriesConfig> = {}): TimeSeriesConfig {
  return {
    columnId: "c1",
    columnName: "VAC1",
    timeColumnId: "c2",
    timeColumnName: "DATE",
    clockColumnId: "c3",
    clockColumnName: "TIME",
    title: "VAC1 over time",
    lsl: 650,
    usl: 950,
    ...over,
  };
}

describe("parseTimestampCell", () => {
  it("reads an instrument print's split date and time", () => {
    expect(parseTimestampCell("22/05/2026", "20:59:11")).toBe(
      Date.UTC(2026, 4, 22, 20, 59, 11)
    );
  });

  it("reads a date with no clock as midnight", () => {
    expect(parseTimestampCell("22/05/2026")).toBe(Date.UTC(2026, 4, 22));
  });

  it("reads an ISO date and an ISO date-time", () => {
    expect(parseTimestampCell("2026-05-22")).toBe(Date.UTC(2026, 4, 22));
    expect(parseTimestampCell("2026-05-22", "20:59")).toBe(
      Date.UTC(2026, 4, 22, 20, 59)
    );
  });

  it("reads a single cell holding both", () => {
    expect(parseTimestampCell("22/05/2026 20:59:11")).toBe(
      Date.UTC(2026, 4, 22, 20, 59, 11)
    );
  });

  it("returns null for text that is not a timestamp", () => {
    expect(parseTimestampCell("N/A", "")).toBeNull();
    expect(parseTimestampCell("", "20:59:11")).toBeNull();
  });
});

describe("computeTimeSeries", () => {
  const dates = (n: number) => Array(n).fill("22/05/2026");

  it("finds one contiguous run and reports readings and minutes separately", () => {
    // Eight readings one minute apart span seven minutes — the distinction
    // that produced four different durations for one excursion in ERF/26/022.
    const values = [
      "800", "800", "800",
      "192.4", "300", "400", "500", "600", "640", "645", "649",
      "800", "800",
    ];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(values.length) },
      { id: "c3", name: "TIME", values: minuteStamps(values.length) },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.excursions).toHaveLength(1);
    const run = outcome.result.excursions[0]!;
    expect(run.readings).toBe(8);
    expect(run.elapsedMinutes).toBe(7);
    expect(run.min).toBe(192.4);
    expect(run.direction).toBe("low");
    expect(outcome.result.excursionReadings).toBe(8);
  });

  it("reports no excursion when every reading is inside the band", () => {
    const values = ["800", "810", "790", "805"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(values.length) },
      { id: "c3", name: "TIME", values: minuteStamps(values.length) },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.excursions).toEqual([]);
    expect(outcome.result.n).toBe(4);
  });

  it("selects the band per row from the recorded setpoint", () => {
    // 500 is inside 380–620 but far below 650–950. The same number is an
    // excursion or not depending on which setpoint was in force.
    const values = ["800", "500", "500", "800"];
    const setpoints = ["800", "500", "500", "800"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(values.length) },
      { id: "c3", name: "TIME", values: minuteStamps(values.length) },
      { id: "c4", name: "SETPOINT", values: setpoints },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({
        lsl: null,
        usl: null,
        conditionColumnId: "c4",
        conditionColumnName: "SETPOINT",
        bands: [
          { when: "800", lsl: 650, usl: 950 },
          { when: "500", lsl: 380, usl: 620 },
        ],
      })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.excursions).toEqual([]);
    // The band steps with the setpoint, so shading is two segments, not one.
    expect(outcome.result.bandSegments).toHaveLength(3);
    expect(outcome.result.bandSegments[1]).toMatchObject({
      lsl: 380,
      usl: 620,
      condition: "500",
    });
  });

  it("splits a run when the applicable band changes mid-excursion", () => {
    // Merging would report a duration against limits that were not in force.
    const values = ["300", "300", "300", "300"];
    const setpoints = ["800", "800", "500", "500"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(values.length) },
      { id: "c3", name: "TIME", values: minuteStamps(values.length) },
      { id: "c4", name: "SETPOINT", values: setpoints },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({
        lsl: null,
        usl: null,
        conditionColumnId: "c4",
        conditionColumnName: "SETPOINT",
        bands: [
          { when: "800", lsl: 650, usl: 950 },
          { when: "500", lsl: 380, usl: 620 },
        ],
      })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.excursions).toHaveLength(2);
    expect(outcome.result.excursions[0]!.condition).toBe("800");
    expect(outcome.result.excursions[1]!.condition).toBe("500");
  });

  it("skips rows with no number or no readable timestamp", () => {
    const values = ["800", "OOT", "810", "820"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: ["22/05/2026", "22/05/2026", "", "22/05/2026"] },
      { id: "c3", name: "TIME", values: minuteStamps(values.length) },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(2);
    expect(outcome.result.skipped).toBe(2);
  });

  it("refuses a series with fewer than two readable readings", () => {
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values: ["800"] },
      { id: "c2", name: "DATE", values: ["22/05/2026"] },
      { id: "c3", name: "TIME", values: ["20:55:11"] },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("too_few_values");
  });

  it("says so when nothing parsed as a timestamp", () => {
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values: ["800", "810", "820"] },
      { id: "c2", name: "DATE", values: ["Batch A", "Batch A", "Batch A"] },
      { id: "c3", name: "TIME", values: ["", "", ""] },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("unparsed_timestamps");
  });

  it("rejects a lower spec that is not below the upper", () => {
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values: ["800", "810"] },
      { id: "c2", name: "DATE", values: dates(2) },
      { id: "c3", name: "TIME", values: minuteStamps(2) },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({ lsl: 950, usl: 650 })
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("invalid_specs");
  });

  it("carries the worksheet row number onto each point", () => {
    const values = ["800", "810", "820", "830"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(4) },
      { id: "c3", name: "TIME", values: minuteStamps(4) },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({ rowStart: 2, rowEnd: 4 })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.points.map((point) => point.row)).toEqual([2, 3, 4]);
  });

  it("reports nothing assessed when no band is in force", () => {
    // The dangerous case: zero excursions because nothing was checked. A
    // report must never read that as a pass.
    const values = ["800", "810", "820"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(3) },
      { id: "c3", name: "TIME", values: minuteStamps(3) },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({ lsl: null, usl: null })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.judgedReadings).toBe(0);
    expect(outcome.result.excursions).toEqual([]);
  });

  it("counts only the rows a conditional band actually covered", () => {
    // Idle rows carry setpoint 0, which matches no band and is left unjudged.
    const values = ["800", "800", "800", "800"];
    const setpoints = ["0", "0", "800", "800"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(4) },
      { id: "c3", name: "TIME", values: minuteStamps(4) },
      { id: "c4", name: "VAC2", values: setpoints },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({
        lsl: null,
        usl: null,
        conditionColumnId: "c4",
        conditionColumnName: "VAC2",
        bands: [{ when: "800", lsl: 650, usl: 950 }],
      })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(4);
    expect(outcome.result.judgedReadings).toBe(2);
  });

  it("plots without a spec at all", () => {
    const values = ["800", "810", "820"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(3) },
      { id: "c3", name: "TIME", values: minuteStamps(3) },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({ lsl: null, usl: null })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.excursions).toEqual([]);
    expect(outcome.result.bandSegments).toEqual([]);
  });

  it("builds a chart spec with epoch x and a time tick format", () => {
    const values = ["800", "810", "820"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(3) },
      { id: "c3", name: "TIME", values: minuteStamps(3) },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const spec = outcome.result.specs[0]!;
    expect(spec.layout.xTickFormat).toBe("time");
    expect(spec.layout.mark).toBe("line");
    expect(spec.points[0]!.x).toBe(Date.UTC(2026, 4, 22, 20, 55, 11));
    expect(spec.limits).toEqual({ lower: 650, upper: 950 });
  });

  it("decimates a long series but never drops an out-of-band reading", () => {
    // A figure that lost the excursion would be worse than no figure.
    const n = MAX_TIME_SERIES_POINTS + 2_000;
    const values = Array.from({ length: n }, (_, i) =>
      i === 5_000 || i === 5_001 ? "100" : "800"
    );
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: minuteDates(n) },
      { id: "c3", name: "TIME", values: minuteStamps(n) },
    ]);
    const outcome = computeTimeSeries(worksheet, config());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.n).toBe(n);
    expect(outcome.result.decimated).toBe(true);
    expect(outcome.result.points.length).toBeLessThan(n);
    const plottedLows = outcome.result.points.filter(
      (point) => point.value === 100
    );
    expect(plottedLows).toHaveLength(2);
    expect(outcome.result.excursions).toHaveLength(1);
    expect(outcome.result.excursions[0]!.readings).toBe(2);
  });

  it("leaves chart limits empty when the band steps", () => {
    // ChartLimits holds one pair; drawing the first band across the whole
    // cycle would assert limits that were not in force.
    const values = ["800", "500"];
    const worksheet = sheetWith([
      { id: "c1", name: "VAC1", values },
      { id: "c2", name: "DATE", values: dates(2) },
      { id: "c3", name: "TIME", values: minuteStamps(2) },
      { id: "c4", name: "SETPOINT", values: ["800", "500"] },
    ]);
    const outcome = computeTimeSeries(
      worksheet,
      config({
        lsl: null,
        usl: null,
        conditionColumnId: "c4",
        conditionColumnName: "SETPOINT",
        bands: [
          { when: "800", lsl: 650, usl: 950 },
          { when: "500", lsl: 380, usl: 620 },
        ],
      })
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const spec = outcome.result.specs[0]!;
    expect(spec.limits).toEqual({ lower: null, upper: null });
    expect(spec.layout.showSpecLimits).toBe(false);
  });
});

