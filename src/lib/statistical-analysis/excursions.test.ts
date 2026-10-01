import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectTables } from "@/lib/attachments/table-extract";
import {
  bandForRow,
  detectExcursions,
  elapsedMinutes,
  formatElapsed,
  parseInstrumentTimestamp,
  type ConditionalSpec,
} from "./excursions";

const FIXED = { lsl: 650, usl: 950 };

describe("detectExcursions", () => {
  it("returns nothing when the series stays in band", () => {
    expect(
      detectExcursions({ values: [700, 800, 900], spec: FIXED })
    ).toEqual([]);
  });

  it("groups consecutive out-of-band readings into one run", () => {
    const runs = detectExcursions({
      values: [800, 600, 500, 400, 800, 800],
      spec: FIXED,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.startIndex).toBe(1);
    expect(runs[0]!.endIndex).toBe(3);
    expect(runs[0]!.readings).toBe(3);
    expect(runs[0]!.min).toBe(400);
    expect(runs[0]!.direction).toBe("low");
  });

  it("separates runs divided by an in-band reading", () => {
    const runs = detectExcursions({
      values: [600, 800, 600],
      spec: FIXED,
    });
    expect(runs.map((r) => r.readings)).toEqual([1, 1]);
  });

  it("reports a run that breaches both limits as mixed", () => {
    const runs = detectExcursions({ values: [600, 1000], spec: FIXED });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.direction).toBe("mixed");
  });

  it("treats gaps as breaks, not excursions", () => {
    const runs = detectExcursions({
      values: [600, null, 600],
      spec: FIXED,
    });
    expect(runs.map((r) => r.readings)).toEqual([1, 1]);
  });

  it("counts readings and elapsed time separately", () => {
    // Eight readings one minute apart span seven minutes. Conflating the two
    // is what produced four different durations in ERF/26/022.
    const base = Date.UTC(2026, 4, 22, 20, 59, 11);
    const runs = detectExcursions({
      values: Array.from({ length: 8 }, () => 300),
      timestamps: Array.from({ length: 8 }, (_, i) => base + i * 60_000),
      spec: FIXED,
    });
    expect(runs[0]!.readings).toBe(8);
    expect(elapsedMinutes(runs[0]!)).toBe(7);
    expect(formatElapsed(runs[0]!.elapsedMs)).toBe("0:07:00");
  });

  it("carries source pages for citation", () => {
    const runs = detectExcursions({
      values: [600, 600, 600],
      pages: [12, 12, 13],
      spec: FIXED,
    });
    expect(runs[0]!.pages).toEqual([12, 13]);
  });
});

describe("conditional spec", () => {
  const SPEC: ConditionalSpec = {
    byColumn: "VAC2",
    bands: [
      { when: "800", band: { lsl: 650, usl: 950 } },
      { when: "600", band: { lsl: 480, usl: 720 } },
      { when: "500", band: { lsl: 380, usl: 620 } },
      { when: "250", band: { lsl: 200, usl: 600 } },
    ],
  };

  it("selects the band from the companion column", () => {
    expect(bandForRow(SPEC, "600")).toEqual({ lsl: 480, usl: 720 });
    // Instrument prints write 800.0; the selector must not care.
    expect(bandForRow(SPEC, "800.0")).toEqual({ lsl: 650, usl: 950 });
  });

  it("leaves rows unjudged when nothing matches and there is no fallback", () => {
    expect(bandForRow(SPEC, "1000")).toBeNull();
    expect(
      detectExcursions({ values: [0], conditions: ["1000"], spec: SPEC })
    ).toEqual([]);
  });

  it("judges each row against its own band", () => {
    // 700 is in band at setpoint 800 (650-950) but high at setpoint 500 (380-620).
    const runs = detectExcursions({
      values: [700, 700],
      conditions: ["800", "500"],
      spec: SPEC,
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.startIndex).toBe(1);
    expect(runs[0]!.direction).toBe("high");
  });

  it("splits a run when the applicable band changes", () => {
    // Merging these would report a duration against limits that were not in
    // force for all of it.
    const runs = detectExcursions({
      values: [300, 300],
      conditions: ["800", "600"],
      spec: SPEC,
    });
    expect(runs).toHaveLength(2);
    expect(runs[0]!.band).toEqual({ lsl: 650, usl: 950 });
    expect(runs[1]!.band).toEqual({ lsl: 480, usl: 720 });
  });
});

describe("parseInstrumentTimestamp", () => {
  it("reads the print's dd/mm/yyyy HH:MM:SS", () => {
    expect(parseInstrumentTimestamp("22/05/2026", "20:59:11")).toBe(
      Date.UTC(2026, 4, 22, 20, 59, 11)
    );
  });
  it("rejects anything else", () => {
    expect(parseInstrumentTimestamp("2026-05-22", "20:59:11")).toBeNull();
    expect(parseInstrumentTimestamp("22/05/2026", "nope")).toBeNull();
  });
});

/**
 * End-to-end against the real prints when staged locally: parser -> excursion
 * detection must reproduce the findings established by independent analysis
 * during the ERF/26/022 review.
 */
const REAL = "/tmp/trend";
const staged = fs.existsSync(path.join(REAL, "RIG25014.txt"));

describe.skipIf(!staged)("real print: RIG25014", () => {
  const SPEC: ConditionalSpec = {
    byColumn: "VAC2",
    bands: [
      { when: "800", band: { lsl: 650, usl: 950 } },
      { when: "600", band: { lsl: 480, usl: 720 } },
      { when: "500", band: { lsl: 380, usl: 620 } },
      { when: "250", band: { lsl: 200, usl: 600 } },
    ],
  };

  function loadRuns(batch: string) {
    const text = fs.readFileSync(path.join(REAL, `${batch}.txt`), "utf8");
    const parts = text.split(/(?=M\. J\. BIOPHARM Pvt\. Ltd\.)/);
    const [table] = detectTables(
      parts.map((t, i) => ({ pageNumber: i + 1, text: t }))
    );
    const col = (name: string) =>
      table!.columns.findIndex((c) => c.name === name);
    const vac1 = col("VAC1");
    const vac2 = col("VAC2");
    const d = col("DATE");
    const t = col("TIME");
    return detectExcursions({
      values: table!.rows.map((r) => Number(r.values[vac1])),
      conditions: table!.rows.map((r) => r.values[vac2] ?? ""),
      labels: table!.rows.map((r) => `${r.values[d]} ${r.values[t]}`),
      timestamps: table!.rows.map((r) =>
        parseInstrumentTimestamp(r.values[d] ?? "", r.values[t] ?? "")
      ),
      pages: table!.rows.map((r) => r.pageNumber),
      spec: SPEC,
    });
  }

  it("finds exactly one excursion, matching the review", () => {
    const runs = loadRuns("RIG25014");
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.readings).toBe(8);
    expect(elapsedMinutes(run)).toBe(7);
    expect(run.min).toBeCloseTo(192.4, 1);
    expect(run.direction).toBe("low");
    expect(run.startLabel).toBe("22/05/2026 20:59:11");
    expect(run.endLabel).toBe("22/05/2026 21:06:11");
    expect(run.band).toEqual({ lsl: 650, usl: 950 });
  });

  it("reproduces the undisclosed RIG23001 Step-4 excursion", () => {
    // 101 consecutive readings above the 380-620 band, absent from the report.
    const long = loadRuns("RIG23001")
      .filter((r) => r.band.usl === 620)
      .sort((a, b) => b.readings - a.readings)[0];
    expect(long?.readings).toBe(101);
    expect(long?.direction).toBe("high");
  });

  it("reproduces the RIG23008 count under the proposed band", () => {
    // The report says 16; under 650-950 it is 18 readings.
    const step1 = loadRuns("RIG23008")
      .filter((r) => r.band.lsl === 650)
      .sort((a, b) => b.readings - a.readings)[0];
    expect(step1?.readings).toBe(18);
  });
});
