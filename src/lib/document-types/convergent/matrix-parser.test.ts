import { describe, expect, it } from "vitest";
import type { EvaluationContext } from "@/lib/document-types/types";
import type { ReportRecord } from "@/types/report";
import {
  checkEquipmentCalibrationDates,
  checkEquipmentTablePresent,
  checkResultsIdsUnique,
  checkResultsMatrixComplete,
  checkResultsPassFailValues,
} from "./deterministic-checks";
import { parseEquipmentMatrix, parseResultsMatrix } from "./matrix-parser";
import {
  CONVERGENT_EQUIPMENT_HEADERS,
  CONVERGENT_RESULTS_HEADERS,
} from "@/lib/document-types/design-verification/sections";

function cell(text: string) {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
  };
}

function header(text: string) {
  return {
    type: "tableHeader",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function tableDoc(headers: readonly string[], rows: string[][]) {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          { type: "tableRow", content: headers.map(header) },
          ...rows.map((r) => ({
            type: "tableRow",
            content: r.map(cell),
          })),
        ],
      },
    ],
  };
}

const fakeReport = {
  id: "r1",
  documentType: "design_verification",
  documentNo: "DVR-1",
  date: "2026-01-01",
  metadata: {},
  status: "draft",
  authorId: "u1",
  assignedManagerId: null,
  createdAt: "",
  updatedAt: "",
} as ReportRecord;

function ctx(
  content: unknown,
  section: EvaluationContext["section"] = "test_equipment"
): EvaluationContext {
  return {
    section,
    content,
    dependencies: {},
    report: fakeReport,
  };
}

describe("Convergent equipment matrix", () => {
  it("parses equipment rows", () => {
    const parsed = parseEquipmentMatrix({
      table: tableDoc(CONVERGENT_EQUIPMENT_HEADERS, [
        ["Power meter", "Keysight", "N1914A", "CD-1001", "2030-01-15"],
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.assetTag).toBe("CD-1001");
    expect(parsed.missingColumns).toEqual([]);
  });

  it("requires columns and at least one data row", () => {
    const empty = checkEquipmentTablePresent(
      ctx({ table: tableDoc(CONVERGENT_EQUIPMENT_HEADERS, []) })
    );
    expect(empty.status).toBe("not_met");

    const present = checkEquipmentTablePresent(
      ctx({
        table: tableDoc(CONVERGENT_EQUIPMENT_HEADERS, [
          ["Power meter", "Keysight", "N1914A", "CD-1001", "2030-01-15"],
        ]),
      })
    );
    expect(present.status).toBe("met");
  });

  it("flags missing and expired calibration due dates", () => {
    const missing = checkEquipmentCalibrationDates(
      ctx({
        table: tableDoc(CONVERGENT_EQUIPMENT_HEADERS, [
          ["Power meter", "Keysight", "N1914A", "CD-1001", ""],
        ]),
      })
    );
    expect(missing.status).toBe("partially_met");

    const expired = checkEquipmentCalibrationDates(
      ctx({
        table: tableDoc(CONVERGENT_EQUIPMENT_HEADERS, [
          ["Power meter", "Keysight", "N1914A", "CD-1001", "2020-01-01"],
        ]),
      })
    );
    expect(expired.status).toBe("partially_met");

    const ok = checkEquipmentCalibrationDates(
      ctx({
        table: tableDoc(CONVERGENT_EQUIPMENT_HEADERS, [
          ["Power meter", "Keysight", "N1914A", "CD-1001", "2030-01-15"],
        ]),
      })
    );
    expect(ok.status).toBe("met");
  });
});

describe("Convergent results matrix", () => {
  it("parses requirement rows", () => {
    const parsed = parseResultsMatrix({
      table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
        ["REQ-1", "Energy spec", "TM-1", "Pass"],
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]?.requirementId).toBe("REQ-1");
    expect(parsed.rows[0]?.passFail).toBe("Pass");
  });

  it("keeps dotted requirement IDs verbatim", () => {
    const parsed = parseResultsMatrix({
      table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
        ["SW-SST-5.1.1", "Soft tissue", "TOP-00051 datasheets", "Pass"],
        ["SW-IN-1.1", "Upgrade", "TOP-00051 datasheets", "Pass"],
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.map((row) => row.requirementId)).toEqual([
      "SW-SST-5.1.1",
      "SW-IN-1.1",
    ]);
  });

  it("requires Req ID and P/F on each row", () => {
    const incomplete = checkResultsMatrixComplete(
      ctx(
        {
          table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
            ["REQ-1", "Energy spec", "TM-1", ""],
          ]),
        },
        "results_and_discussions"
      )
    );
    expect(incomplete.status).toBe("partially_met");

    const complete = checkResultsMatrixComplete(
      ctx(
        {
          table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
            ["REQ-1", "Energy spec", "TM-1", "P"],
          ]),
        },
        "results_and_discussions"
      )
    );
    expect(complete.status).toBe("met");
  });

  it("accepts Pass/Fail aliases and rejects other P/F values", () => {
    const ok = checkResultsPassFailValues(
      ctx(
        {
          table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
            ["REQ-1", "A", "TM-1", "P"],
            ["REQ-2", "B", "TM-2", "Fail"],
          ]),
        },
        "results_and_discussions"
      )
    );
    expect(ok.status).toBe("met");

    const bad = checkResultsPassFailValues(
      ctx(
        {
          table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
            ["REQ-1", "A", "TM-1", "maybe"],
          ]),
        },
        "results_and_discussions"
      )
    );
    expect(bad.status).toBe("not_met");
  });

  it("flags duplicate requirement IDs", () => {
    const dupes = checkResultsIdsUnique(
      ctx(
        {
          table: tableDoc(CONVERGENT_RESULTS_HEADERS, [
            ["REQ-1", "A", "TM-1", "Pass"],
            ["REQ-1", "B", "TM-2", "Fail"],
          ]),
        },
        "results_and_discussions"
      )
    );
    expect(dupes.status).toBe("partially_met");
  });
});
