import { describe, expect, it } from "vitest";
import { getCriteria } from "@/lib/document-types";
import { rowsForSection, suggestionCardSectionKeys } from "./criteria-view";
import type { EvaluationRecord } from "@/types/report";

const storedEval = (overrides: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: "eval-1",
  reportId: "r1",
  sectionId: "sec-define",
  section: "define",
  criterionKey: "define.datetime",
  criterionLabel: "Date/time",
  status: "met",
  reasoning: "Both times are present.",
  bypassed: false,
  evaluatedContentHash: "abc",
  updatedAt: "",
  ...overrides,
});

describe("rowsForSection", () => {
  it("shows the current registry label when a stored evaluation has stale wording", () => {
    const live = getCriteria("investigation_report", "define").find(
      (criterion) => criterion.key === "define.datetime"
    );
    expect(live?.label).toBeTruthy();
    expect(live?.label).not.toBe("Date/time");

    const row = rowsForSection("define", [storedEval({})]).find(
      (candidate) => candidate.criterionKey === "define.datetime"
    );
    expect(row?.criterionLabel).toBe(live?.label);
    expect(row?.status).toBe("met");
    expect(row?.reasoning).toBe("Both times are present.");
    expect(row?.isPlaceholder).toBe(false);
  });
});

describe("suggestionCardSectionKeys", () => {
  it("uses evaluatable DMAIC sections for investigation reports", () => {
    const keys = suggestionCardSectionKeys("investigation_report");
    expect(keys).toContain("define");
    expect(keys).toContain("conclusion");
    expect(keys).not.toContain("body");
  });

  it("falls back to the editable body for blank documents", () => {
    expect(suggestionCardSectionKeys("generic_document")).toEqual(["body"]);
  });
});
