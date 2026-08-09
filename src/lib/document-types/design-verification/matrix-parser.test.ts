import { describe, expect, it } from "vitest";
import {
  parseTraceabilityMatrix,
  parseTestResultsMatrix,
} from "@/lib/document-types/design-verification/matrix-parser";
import {
  checkEveryInputHasTest,
  checkNoOrphanTests,
  checkTraceabilityComplete,
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

function matrixDoc(
  rows: Array<[string, string, string, string, string]>
) {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              header("Requirement ID"),
              header("Design Input"),
              header("Test Method / ID"),
              header("Result"),
              header("Risk Control Link"),
            ],
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
  });

  it("rejects wrong headers", () => {
    const bad = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [header("Wrong"), header("Headers")],
            },
          ],
        },
      ],
    };
    const parsed = parseTraceabilityMatrix({ table: bad });
    expect(parsed.ok).toBe(false);
  });

  it("parses seeded empty tables as readable with no data rows", () => {
    const parsed = parseTraceabilityMatrix(EMPTY_DV_CONTENT.traceability);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // seeded template includes one blank data row
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

  it("checks results against requirement IDs", () => {
    const traceability = {
      table: matrixDoc([["REQ-1", "Input A", "TM-1", "Pass", ""]]),
    };
    const resultsDoc = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                header("Test ID"),
                header("Requirement ID"),
                header("Result"),
                header("Pass/Fail"),
                header("Raw Data Ref"),
              ],
            },
            {
              type: "tableRow",
              content: ["T-1", "REQ-99", "ok", "Pass", "att-1"].map(cell),
            },
          ],
        },
      ],
    };
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
