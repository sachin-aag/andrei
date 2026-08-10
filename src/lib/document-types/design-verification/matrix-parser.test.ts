import { describe, expect, it } from "vitest";
import {
  parseTraceabilityMatrix,
  parseTestResultsMatrix,
} from "@/lib/document-types/design-verification/matrix-parser";
import {
  checkEveryInputHasTest,
  checkNoOrphanTests,
  checkRiskControlLinks,
  checkTraceabilityComplete,
  checkConsistentRequirementIds,
  checkResultsTraceToRequirements,
} from "@/lib/document-types/design-verification/deterministic-checks";
import {
  EMPTY_DV_CONTENT,
} from "@/lib/document-types/design-verification/sections";
import type { EvaluationContext } from "@/lib/document-types/types";
import type { ReportRecord } from "@/types/report";

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

function tableDoc(headers: string[], rows: string[][]) {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: headers.map(header),
          },
          ...rows.map((r) => ({
            type: "tableRow",
            content: r.map(cell),
          })),
        ],
      },
    ],
  };
}

function matrixDoc(
  rows: Array<[string, string, string, string, string]>
) {
  return tableDoc(
    [
      "Requirement ID",
      "Design Input",
      "Test Method / ID",
      "Result",
      "Risk Control Link",
    ],
    rows
  );
}

const fakeReport = {
  id: "r1",
  documentType: "design_verification",
  documentNo: "DV-1",
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
  dependencies: Record<string, unknown> = {}
): EvaluationContext {
  return {
    section: "traceability",
    content,
    dependencies,
    report: fakeReport,
  };
}

describe("DV matrix parser", () => {
  it("parses a well-formed traceability table", () => {
    const parsed = parseTraceabilityMatrix({
      table: matrixDoc([
        ["REQ-1", "Input A", "TM-1", "Pass", "RC-1"],
        ["REQ-2", "Input B", "TM-2", "Fail", ""],
      ]),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.requirementId).toBe("REQ-1");
    expect(parsed.rows[1]?.testMethodId).toBe("TM-2");
    expect(parsed.missingColumns).toEqual([]);
  });

  it("parses unrecognized headers without data as empty rows (not a hard failure)", () => {
    const bad = tableDoc(["Wrong", "Headers"], []);
    const parsed = parseTraceabilityMatrix({ table: bad });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(0);
  });

  it("parses reordered headers by meaning", () => {
    const parsed = parseTraceabilityMatrix({
      table: tableDoc(
        [
          "Requirement ID",
          "Test Method / ID",
          "Design Input",
          "Risk Control Link",
          "Result",
        ],
        [["REQ-1", "TM-1", "Input A", "RC-1", "Pass"]]
      ),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]).toMatchObject({
      requirementId: "REQ-1",
      designInput: "Input A",
      testMethodId: "TM-1",
      result: "Pass",
      riskControlLink: "RC-1",
    });
  });

  it("parses aliased headers", () => {
    const parsed = parseTraceabilityMatrix({
      table: tableDoc(
        ["Req ID", "Input", "Test Case", "Outcome", "Hazard ID"],
        [["SW-005", "Watchdog shall trip", "TM-WD-1", "Pass", "H-12"]]
      ),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]).toMatchObject({
      requirementId: "SW-005",
      designInput: "Watchdog shall trip",
      testMethodId: "TM-WD-1",
      result: "Pass",
      riskControlLink: "H-12",
    });
    expect(parsed.missingColumns).toEqual([]);
  });

  it("tolerates a missing Result column and reports it", () => {
    const parsed = parseTraceabilityMatrix({
      table: tableDoc(
        [
          "Requirement ID",
          "Test Method / ID",
          "Design Input",
          "Risk Control Link",
        ],
        [
          [
            "SW-005",
            "Watchdog timeout/injection test",
            "Software watchdog failure shall produce a safe laser state.",
            "H-12",
          ],
        ]
      ),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]).toMatchObject({
      requirementId: "SW-005",
      testMethodId: "Watchdog timeout/injection test",
      designInput:
        "Software watchdog failure shall produce a safe laser state.",
      riskControlLink: "H-12",
      result: "",
    });
    expect(parsed.missingColumns).toContain("Result");
  });

  it("falls back positionally when headers are unrecognizable", () => {
    // Non-ID-like cells so content inference does not claim columns;
    // with zero header matches, positional mapping applies.
    const parsed = parseTraceabilityMatrix({
      table: tableDoc(
        ["Col A", "Col B", "Col C", "Col D", "Col E"],
        [["Alpha", "Bravo text here", "Charlie", "Delta", "Echo"]]
      ),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]).toMatchObject({
      requirementId: "Alpha",
      designInput: "Bravo text here",
      testMethodId: "Charlie",
      result: "Delta",
      riskControlLink: "Echo",
    });
  });

  it("infers ID-like columns from content under unrecognized headers", () => {
    // One recognizable header so positional fallback does not fire;
    // remaining ID columns come from content.
    const parsed = parseTraceabilityMatrix({
      table: tableDoc(
        ["Thing", "Stuff", "Design Input", "Noise", "Risk Control Link"],
        [
          ["REQ-1", "TM-1", "Input A", "hello world", "RC-1"],
          ["REQ-2", "TM-2", "Input B", "more prose here", "RC-2"],
        ]
      ),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows[0]?.designInput).toBe("Input A");
    expect(parsed.rows[0]?.riskControlLink).toBe("RC-1");
    // Content inference should pick the two ID-like columns.
    expect(parsed.rows[0]?.requirementId).toBe("REQ-1");
    expect(parsed.rows[0]?.testMethodId).toBe("TM-1");
  });

  it("parses seeded empty tables as readable with no data rows", () => {
    const parsed = parseTraceabilityMatrix(EMPTY_DV_CONTENT.traceability);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.every((r) => !r.requirementId && !r.testMethodId)).toBe(
      true
    );
  });
});

describe("DV deterministic checks", () => {
  it("flags incomplete matrix", () => {
    const result = checkTraceabilityComplete(
      ctx({
        table: matrixDoc([["REQ-1", "Input A", "", "Pass", ""]]),
      })
    );
    expect(result.status).toBe("partially_met");
  });

  it("detects design inputs without tests", () => {
    const result = checkEveryInputHasTest(
      ctx({
        table: matrixDoc([
          ["REQ-1", "Input A", "TM-1", "Pass", ""],
          ["REQ-2", "Input B", "", "", ""],
        ]),
      })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/REQ-2|Input B/i);
  });

  it("detects orphan tests", () => {
    const result = checkNoOrphanTests(
      ctx({
        table: matrixDoc([["", "", "TM-orphan", "Pass", ""]]),
      })
    );
    expect(result.status).toBe("not_met");
  });

  it("marks reordered screenshot-style matrix as met when content is present", () => {
    const content = {
      table: tableDoc(
        [
          "Requirement ID",
          "Test Method / ID",
          "Design Input",
          "Risk Control Link",
        ],
        [
          [
            "SW-005",
            "Watchdog timeout/injection test",
            "Software watchdog failure shall produce a safe laser state.",
            "H-12",
          ],
          [
            "SW-006",
            "Interlock continuity test",
            "Door interlock open shall inhibit laser emission.",
            "H-14",
          ],
        ]
      ),
    };
    expect(checkTraceabilityComplete(ctx(content)).status).toBe("met");
    expect(checkEveryInputHasTest(ctx(content)).status).toBe("met");
    expect(checkNoOrphanTests(ctx(content)).status).toBe("met");
    expect(checkRiskControlLinks(ctx(content)).status).toBe("met");
    expect(checkConsistentRequirementIds(ctx(content)).status).toBe("met");
  });

  it("reports missing risk-control column specifically", () => {
    const result = checkRiskControlLinks(
      ctx({
        table: tableDoc(
          ["Requirement ID", "Design Input", "Test Method / ID", "Result"],
          [["REQ-1", "Input A", "TM-1", "Pass"]]
        ),
      })
    );
    expect(result.status).toBe("not_met");
    expect(result.reasoning).toMatch(/Risk Control Link column/i);
  });

  it("checks results against requirement IDs", () => {
    const traceability = {
      table: matrixDoc([["REQ-1", "Input A", "TM-1", "Pass", ""]]),
    };
    const resultsDoc = tableDoc(
      ["Test ID", "Requirement ID", "Result", "Pass/Fail", "Raw Data Ref"],
      [["T-1", "REQ-99", "ok", "Pass", "att-1"]]
    );
    const result = checkResultsTraceToRequirements(
      ctx({ table: resultsDoc }, { traceability })
    );
    expect(result.status).not.toBe("met");
  });

  it("accepts empty seeded test results as parseable", () => {
    const parsed = parseTestResultsMatrix(EMPTY_DV_CONTENT.test_results);
    expect(parsed.ok).toBe(true);
  });
});
