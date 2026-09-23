import { describe, expect, it } from "vitest";
import {
  columnMatchesHint,
  inferColumnRoles,
  suggestTimeSeriesColumns,
} from "./column-roles";
import type { WorksheetColumn } from "./types";

function col(id: string, name: string, values: string[]): WorksheetColumn {
  return { id, name, values };
}

/** A lyophilizer print: date, clock, six probes, vacuum, setpoint, pressure. */
function lyoSheet(): WorksheetColumn[] {
  const n = 300;
  const dates = Array.from({ length: n }, () => "22/05/2026");
  const times = Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(2026, 4, 22, 20, 0, 0) + i * 60_000);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:11`;
  });
  // VAC1 varies every row; VAC2 holds a handful of setpoints for long runs.
  const vac1 = Array.from({ length: n }, (_, i) => (800 + (i % 97) * 0.7).toFixed(1));
  const vac2 = Array.from({ length: n }, (_, i) =>
    i < 60 ? "0.0" : i < 180 ? "800.0" : i < 240 ? "600.0" : "500.0"
  );
  return [
    col("c1", "DATE", dates),
    col("c2", "TIME", times),
    col("c3", "TT1", Array.from({ length: n }, () => "-5.0")),
    col("c4", "VAC1", vac1),
    col("c5", "VAC2", vac2),
    col("c6", "PT1", Array.from({ length: n }, (_, i) => (12 + (i % 53) * 0.3).toFixed(1))),
  ];
}

describe("inferColumnRoles", () => {
  it("reads a date column, a clock column and a varying measurement", () => {
    const roles = inferColumnRoles(lyoSheet());
    expect(roles.find((r) => r.name === "DATE")?.role).toBe("date");
    expect(roles.find((r) => r.name === "TIME")?.role).toBe("clock");
    expect(roles.find((r) => r.name === "VAC1")?.role).toBe("measurement");
  });

  it("separates a setpoint from a measurement by how it moves", () => {
    // Both are numeric. The setpoint takes four values and holds each.
    const roles = inferColumnRoles(lyoSheet());
    expect(roles.find((r) => r.name === "VAC2")?.role).toBe("setpoint");
    expect(roles.find((r) => r.name === "TT1")?.role).toBe("setpoint");
  });

  it("reads a single cell holding date and time as one timestamp column", () => {
    const roles = inferColumnRoles([
      col("c1", "When", Array.from({ length: 40 }, () => "22/05/2026 20:59:11")),
    ]);
    expect(roles[0]?.role).toBe("timestamp");
  });

  it("calls a short repeated text column a category and a varied one a label", () => {
    const roles = inferColumnRoles([
      col("c1", "Lot", Array.from({ length: 60 }, (_, i) => `Lot ${i % 3}`)),
      col("c2", "Serial", Array.from({ length: 60 }, (_, i) => `SN-${i}`)),
    ]);
    expect(roles[0]?.role).toBe("category");
    expect(roles[1]?.role).toBe("label");
  });

  it("marks an untouched column empty rather than guessing", () => {
    expect(inferColumnRoles([col("c1", "C1", ["", "  ", ""])])[0]?.role).toBe(
      "empty"
    );
  });
});

describe("columnMatchesHint", () => {
  it("matches the header exactly and case-insensitively", () => {
    expect(columnMatchesHint("VAC1", "vac1")).toBe(true);
  });

  it("matches an abbreviation against the word it abbreviates", () => {
    // "chamber vacuum" has to find a column headed VAC1.
    expect(columnMatchesHint("VAC1", "chamber vacuum")).toBe(true);
    expect(columnMatchesHint("VAC1", "vacuum")).toBe(true);
  });

  it("does not match an unrelated channel", () => {
    expect(columnMatchesHint("TT1", "chamber vacuum")).toBe(false);
    expect(columnMatchesHint("PT1", "vacuum")).toBe(false);
  });

  it("ignores punctuation and spacing in the header", () => {
    expect(columnMatchesHint("Assay (%)", "assay")).toBe(true);
  });
});

describe("suggestTimeSeriesColumns", () => {
  it("pairs the clock with the date and picks the hinted channel", () => {
    const picks = suggestTimeSeriesColumns(lyoSheet(), {
      measurementHint: "chamber vacuum",
    });
    expect(picks.timeColumnId).toBe("c1");
    expect(picks.clockColumnId).toBe("c2");
    expect(picks.columnId).toBe("c4");
  });

  it("pairs a measurement with the setpoint that shares its stem", () => {
    // VAC1's band is set by VAC2, not by the nearer-indexed TT1.
    const picks = suggestTimeSeriesColumns(lyoSheet(), {
      measurementHint: "VAC1",
    });
    expect(picks.conditionColumnId).toBe("c5");
    expect(picks.conditionValues).toEqual(["0.0", "500.0", "600.0", "800.0"]);
  });

  it("refuses to pick when several channels fit and none was named", () => {
    // Plotting one of nine instrument channels at random is worse than asking.
    const picks = suggestTimeSeriesColumns(lyoSheet());
    expect(picks.columnId).toBeNull();
    expect(picks.measurementCandidates.map((c) => c.name)).toEqual([
      "VAC1",
      "PT1",
    ]);
  });

  it("picks the only measurement without being asked", () => {
    const picks = suggestTimeSeriesColumns([
      col("c1", "Date", Array.from({ length: 30 }, () => "01/01/2026")),
      col("c2", "Reading", Array.from({ length: 30 }, (_, i) => String(i * 1.7))),
    ]);
    expect(picks.columnId).toBe("c2");
    expect(picks.conditionColumnId).toBeNull();
  });

  it("does not offer a clock column beside a full timestamp", () => {
    const picks = suggestTimeSeriesColumns([
      col("c1", "When", Array.from({ length: 30 }, () => "22/05/2026 20:59:11")),
      col("c2", "Reading", Array.from({ length: 30 }, (_, i) => String(i * 1.7))),
    ]);
    expect(picks.timeColumnId).toBe("c1");
    expect(picks.clockColumnId).toBeNull();
  });
});

describe("a column never sets its own band", () => {
  it("does not offer the measurement as its own condition column", () => {
    // A flat channel classifies as a setpoint and shares its own stem, so
    // without a guard it would be picked to set the limits it is judged by.
    const flat = Array.from({ length: 40 }, () => "800.0");
    const picks = suggestTimeSeriesColumns(
      [
        col("c1", "Date", Array.from({ length: 40 }, () => "01/01/2026")),
        col("c2", "VAC1", flat),
      ],
      { measurementHint: "VAC1" }
    );
    expect(picks.columnId).toBe("c2");
    expect(picks.conditionColumnId).not.toBe("c2");
  });
});
