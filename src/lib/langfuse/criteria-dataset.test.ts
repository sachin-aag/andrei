import { describe, expect, it } from "vitest";
import {
  buildCriteriaDatasetItem,
  criteriaDatasetItemId,
} from "@/lib/langfuse/criteria-dataset";
import type { BulkEvalRow } from "@/lib/sample-eval/bulk-eval-aggregates";

describe("criteriaDatasetItemId", () => {
  it("builds stable ids from source file and criterion key", () => {
    expect(
      criteriaDatasetItemId("Investigation DEV-PR-25-002.docx", "define.what_happened")
    ).toBe("criteria-investigation-dev-pr-25-002--define.what_happened");
  });
});

describe("buildCriteriaDatasetItem", () => {
  const row: BulkEvalRow = {
    sourceFile: "Investigation DEV-PR-25-002.docx",
    deviationNo: "Investigation DEV-PR-25-002",
    section: "define",
    criterionKey: "define.what_happened",
    criterionLabel: "Clearly define what happened actually",
    status: "partially_met",
    reasoning: "Missing equipment ID.",
  };

  it("maps row to input and expectedOutput", () => {
    const item = buildCriteriaDatasetItem({
      row,
      sectionContent: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "On 21/03/2026 the analyst observed OOS." }],
          },
        ],
      },
      reportDate: "2026-05-17",
      reviewIndex: 0,
    });

    expect(item).not.toBeNull();
    expect(item!.id).toBe(
      "criteria-investigation-dev-pr-25-002--define.what_happened"
    );
    expect(item!.input.criterion.key).toBe("define.what_happened");
    expect(item!.input.sectionContent).toContain("21/03/2026");
    expect(item!.expectedOutput.status).toBe("partially_met");
    expect(item!.metadata.humanReviewStatus).toBe("pending");
  });
});
