import { describe, expect, it } from "vitest";
import {
  CONVERGENT_RESULTS_HEADERS,
  DV_TRACEABILITY_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";
import {
  liveTableHeadersMismatch,
  tableSchemaReadStep,
} from "@/lib/ai/chat/table-schema";

describe("tableSchemaReadStep", () => {
  it("forces read_section on the first write step when a scoped section has a table", () => {
    expect(
      tableSchemaReadStep({
        stepsTaken: 0,
        isWrite: true,
        hasReadSectionTool: true,
        inScopeHasTable: true,
      })
    ).toEqual({
      activeTools: ["read_section"],
      toolChoice: { type: "tool", toolName: "read_section" },
    });
  });

  it("does not force a read on greetings, later steps, or prose-only scope", () => {
    expect(
      tableSchemaReadStep({
        stepsTaken: 0,
        isWrite: false,
        hasReadSectionTool: true,
        inScopeHasTable: true,
      })
    ).toBeUndefined();
    expect(
      tableSchemaReadStep({
        stepsTaken: 1,
        isWrite: true,
        hasReadSectionTool: true,
        inScopeHasTable: true,
      })
    ).toBeUndefined();
    expect(
      tableSchemaReadStep({
        stepsTaken: 0,
        isWrite: true,
        hasReadSectionTool: true,
        inScopeHasTable: false,
      })
    ).toBeUndefined();
  });
});

describe("liveTableHeadersMismatch", () => {
  it("rejects a Convergent 4-col draft against the live demo 5-col matrix", () => {
    const hint = liveTableHeadersMismatch({
      content: { table: seededTableDoc(DV_TRACEABILITY_HEADERS) },
      section: "traceability",
      targetField: "table",
      markdown: [
        `| ${CONVERGENT_RESULTS_HEADERS.join(" | ")} |`,
        `| ${CONVERGENT_RESULTS_HEADERS.map(() => "---").join(" | ")} |`,
        "| SYS-006 | Auth | TM-001 | PASS |",
      ].join("\n"),
    });
    expect(hint).toMatch(/Requirement ID/);
    expect(hint).toMatch(/Risk Control Link/);
    expect(hint).toMatch(/Req\. ID/);
  });

  it("accepts a draft that copies the live demo headers", () => {
    expect(
      liveTableHeadersMismatch({
        content: { table: seededTableDoc(DV_TRACEABILITY_HEADERS) },
        section: "traceability",
        targetField: "table",
        markdown: [
          `| ${DV_TRACEABILITY_HEADERS.join(" | ")} |`,
          `| ${DV_TRACEABILITY_HEADERS.map(() => "---").join(" | ")} |`,
          "| SYS-006 | Auth required | TM-001 | PASS | N/A |",
        ].join("\n"),
      })
    ).toBeNull();
  });
});
