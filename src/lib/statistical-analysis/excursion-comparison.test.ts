import { describe, expect, it } from "vitest";
import {
  buildExcursionComparison,
  capBySeverityKeepingOrder,
  summarizeTimeSeriesForPrompt,
} from "./excursion-comparison";
import type {
  StatisticalAnalysisSummary,
  TimeSeriesAnalysisSummary,
  TimeSeriesExcursion,
} from "./types";

function run(over: Partial<TimeSeriesExcursion> = {}): TimeSeriesExcursion {
  return {
    startLabel: "22/05/2026 20:59:11",
    endLabel: "22/05/2026 21:06:11",
    startRow: 300,
    endRow: 307,
    readings: 8,
    elapsedMs: 420_000,
    elapsedMinutes: 7,
    elapsedClock: "0:07:00",
    min: 192.4,
    max: 649.1,
    direction: "low",
    lsl: 650,
    usl: 950,
    condition: "800",
    ...over,
  };
}

function series(
  id: string,
  title: string,
  excursions: TimeSeriesExcursion[],
  n = 2142
): TimeSeriesAnalysisSummary {
  return {
    id,
    workspaceId: "ws-1",
    kind: "time_series",
    title,
    sourceHash: "hash",
    stale: false,
    createdAt: "2026-05-23T00:00:00.000Z",
    previewImage: null,
    config: {
      columnId: "c1",
      columnName: "VAC1",
      timeColumnId: "c2",
      timeColumnName: "DATE",
      title,
      lsl: 650,
      usl: 950,
    },
    results: {
      specs: [],
      n,
      skipped: 0,
      judgedReadings: n,
      points: [],
      decimated: false,
      start: 0,
      end: 1,
      min: 192.4,
      max: 951.2,
      mean: 801.5,
      excursions,
      excursionReadings: excursions.reduce((sum, r) => sum + r.readings, 0),
      bandSegments: [],
    },
  };
}

describe("buildExcursionComparison", () => {
  it("flattens every run across every batch into one list", () => {
    const comparison = buildExcursionComparison([
      series("a", "RIG25014", [run()]),
      series("b", "RIG23008", [
        run({ startLabel: "20/04/2024 18:54:02", readings: 18, elapsedMinutes: 17 }),
      ]),
    ] as StatisticalAnalysisSummary[]);
    expect(comparison.rows).toHaveLength(2);
    expect(comparison.rows.map((row) => row.series)).toEqual([
      // Oldest first: a history table reads forward to the event.
      "RIG23008",
      "RIG25014",
    ]);
    expect(comparison.rows[0]).toMatchObject({ readings: 18, elapsedMinutes: 17 });
  });

  it("keeps a clean batch as a result rather than dropping it", () => {
    // A comparison that lists only failures reads as if nothing was checked.
    const comparison = buildExcursionComparison([
      series("a", "RIG25014", [run()]),
      series("b", "C072630015", [], 1800),
    ] as StatisticalAnalysisSummary[]);
    expect(comparison.rows).toHaveLength(1);
    expect(comparison.clean).toEqual([
      { analysisId: "b", series: "C072630015", n: 1800 },
    ]);
  });

  it("ignores analyses that are not time series", () => {
    expect(buildExcursionComparison([]).rows).toEqual([]);
  });
});

describe("summarizeTimeSeriesForPrompt", () => {
  it("names the runs so the model need not re-derive them from pages", () => {
    const line = summarizeTimeSeriesForPrompt(series("a", "RIG25014", [run()]));
    expect(line).toContain("2142 readings of VAC1");
    expect(line).toContain("1 excursion");
    expect(line).toContain("8 readings");
    expect(line).toContain("7 min");
    expect(line).toContain("192.4");
  });

  it("says plainly when a cycle had none", () => {
    expect(summarizeTimeSeriesForPrompt(series("a", "C072630015", []))).toContain(
      "no excursion"
    );
  });

  it("caps a long list rather than pasting a trend into the prompt", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      run({ startLabel: `run-${i}` })
    );
    const line = summarizeTimeSeriesForPrompt(series("a", "RIG24003", many));
    expect(line).toContain("10 excursions");
    expect(line).toContain("(+4 more)");
  });
});

describe("unassessed series", () => {
  function unjudged(id: string, title: string) {
    const base = series(id, title, []);
    return { ...base, results: { ...base.results, judgedReadings: 0 } };
  }

  it("files a series with no limits as unassessed, not clean", () => {
    // Filing it under "clean" is how a comparison table ends up asserting
    // compliance nobody verified.
    const comparison = buildExcursionComparison([
      series("a", "RIG25014", [run()]),
      unjudged("b", "RIG24003"),
    ] as StatisticalAnalysisSummary[]);
    expect(comparison.clean).toEqual([]);
    expect(comparison.unassessed).toEqual([
      { analysisId: "b", series: "RIG24003", n: 2142 },
    ]);
  });

  it("tells the model not to claim there were none", () => {
    const line = summarizeTimeSeriesForPrompt(unjudged("b", "RIG24003"));
    expect(line).toContain("NO ACCEPTANCE LIMITS SET");
    expect(line).toContain("not assessed");
    expect(line).not.toMatch(/no excursion(?!s were)/);
  });
});

describe("capBySeverityKeepingOrder", () => {
  it("returns everything under the cap, untouched", () => {
    const runs = [run({ readings: 1 }), run({ readings: 2 })];
    const { kept, omitted } = capBySeverityKeepingOrder(runs, 10);
    expect(kept).toEqual(runs);
    expect(omitted).toBe(0);
  });

  it("keeps the worst run even when it is last", () => {
    // RIG23001's real event sits at chronological position 26 of 27, behind
    // 18 single-reading blips. First-N truncation is what hid it.
    const blips = Array.from({ length: 25 }, (_, i) =>
      run({ readings: 1, startRow: i, elapsedMinutes: 1 })
    );
    const event = run({ readings: 101, startRow: 25, elapsedMinutes: 100 });
    const { kept, omitted } = capBySeverityKeepingOrder([...blips, event], 6);
    expect(kept).toHaveLength(6);
    expect(kept.some((r) => r.readings === 101)).toBe(true);
    expect(omitted).toBe(20);
  });

  it("restores the caller's ordering after selecting by severity", () => {
    const runs = [
      run({ readings: 1, startRow: 0 }),
      run({ readings: 50, startRow: 1 }),
      run({ readings: 2, startRow: 2 }),
      run({ readings: 30, startRow: 3 }),
    ];
    const { kept } = capBySeverityKeepingOrder(runs, 2);
    // 50 and 30 are the severe pair; they come back in row order, not rank.
    expect(kept.map((r) => r.startRow)).toEqual([1, 3]);
  });

  it("breaks ties on how far outside the band the run went", () => {
    const shallow = run({ readings: 5, min: 640, lsl: 650, startRow: 0 });
    const deep = run({ readings: 5, min: 192.4, lsl: 650, startRow: 1 });
    const { kept } = capBySeverityKeepingOrder([shallow, deep], 1);
    expect(kept[0]?.min).toBe(192.4);
  });
});
