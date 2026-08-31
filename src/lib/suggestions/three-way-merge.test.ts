import { describe, expect, it } from "vitest";
import {
  DV_TEST_RESULTS_HEADERS,
  DV_TRACEABILITY_HEADERS,
  seededTableDoc,
} from "@/lib/document-types/design-verification/sections";
import { extractRawRows } from "@/lib/document-types/design-verification/matrix-parser";
import { planFieldDiff } from "@/lib/suggestions/diff-plan";
import { applyTableOperation } from "@/lib/suggestions/table-operation";
import { mergeField } from "@/lib/suggestions/three-way-merge";
import { FIXTURES, doc, para } from "@/lib/suggestions/merge-fixtures";

describe("mergeField", () => {
  it("is a noop when current already equals intent", () => {
    const result = mergeField(FIXTURES.prose, FIXTURES.prose, FIXTURES.prose);
    expect(result.status).toBe("noop");
    expect(result.operations).toEqual([]);
  });

  it("applies intent when current still matches base", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const intent = doc(para("The assay failed at 68 percent versus the 80 percent limit."));
    const result = mergeField(base, base, intent);
    expect(result.status).toBe("clean");
    expect(result.operations.length).toBeGreaterThan(0);
  });

  it("keeps the user's edit when intent matches base", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const current = doc(para("The assay failed at 68 percent on batch B-2024-117."));
    const result = mergeField(base, current, base);
    expect(result.status).toBe("noop");
  });

  it("merges non-overlapping line edits on a plain field", () => {
    const base = FIXTURES.plainField;
    const current =
      "Man: operator on shift B was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014.";
    const intent =
      "Man: operator on shift A was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014 rev 3.";
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("clean");
    expect(result.merged).toBe(
      "Man: operator on shift B was performing the fill.\nMachine: HPLC 12.\nMethod: SOP-QC-014 rev 3."
    );
  });

  it("conflicts when both sides rewrite the same sentence", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const current = doc(para("The assay passed after retest."));
    const intent = doc(para("The assay is invalid and will be repeated."));
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("conflict");
    if (result.status === "conflict") {
      expect(result.conflicts.length).toBeGreaterThan(0);
    }
  });

  it("does not invent a Citations duplicate after merge", () => {
    const result = mergeField(
      FIXTURES.citations,
      FIXTURES.citations,
      FIXTURES.citations
    );
    expect(planFieldDiff(result.merged, FIXTURES.citations)).toEqual([]);
  });

  it("keeps the demo 5-col traceability matrix after Agent edit_cells (current === base)", () => {
    const base = seededTableDoc(DV_TRACEABILITY_HEADERS);
    const applied = applyTableOperation(
      base,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, insertText: "SYS-006" },
          {
            row: 1,
            col: 1,
            insertText:
              "The system shall implement a user authentication mechanism.",
          },
          { row: 1, col: 2, insertText: "TM-001: Software verification of login." },
          { row: 1, col: 3, insertText: "PASS" },
          { row: 1, col: 4, insertText: "N/A" },
        ],
      },
      { section: "traceability", targetField: "table" }
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const result = mergeField(base, base, applied.doc);
    expect(result.status).not.toBe("conflict");
    expect(typeof result.merged).not.toBe("string");
    const raw = extractRawRows(result.merged as typeof applied.doc);
    expect(raw).not.toHaveProperty("error");
    if ("error" in raw) return;
    expect(raw.headers).toEqual([...DV_TRACEABILITY_HEADERS]);
    expect(raw.dataRows[0]?.[0]).toBe("SYS-006");
    expect(raw.dataRows[0]?.[3]).toBe("PASS");
    expect(JSON.stringify(result.merged)).not.toMatch(
      /Requirement ID Design Input Test Method/
    );
  });

  it("keeps the demo 5-col test results matrix after Agent edit_cells", () => {
    const base = seededTableDoc(DV_TEST_RESULTS_HEADERS);
    const applied = applyTableOperation(
      base,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 0, insertText: "TM-001" },
          { row: 1, col: 1, insertText: "SYS-006" },
          { row: 1, col: 2, insertText: "Login accepted valid credentials." },
          { row: 1, col: 3, insertText: "PASS" },
          { row: 1, col: 4, insertText: "[protocol.pdf, p. 4]" },
        ],
      },
      { section: "test_results", targetField: "table" }
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const result = mergeField(base, base, applied.doc);
    const raw = extractRawRows(result.merged as typeof applied.doc);
    expect(raw).not.toHaveProperty("error");
    if ("error" in raw) return;
    expect(raw.headers).toEqual([...DV_TEST_RESULTS_HEADERS]);
    expect(raw.dataRows[0]?.[0]).toBe("TM-001");
    expect(raw.dataRows[0]?.[3]).toBe("PASS");
  });

  it("keeps demo matrix columns when current diverged on a different cell", () => {
    const base = seededTableDoc(DV_TRACEABILITY_HEADERS);
    const currentApplied = applyTableOperation(
      base,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 4, insertText: "RMF-12" }],
      },
      { section: "traceability", targetField: "table" }
    );
    const intentApplied = applyTableOperation(
      base,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "SYS-006" }],
      },
      { section: "traceability", targetField: "table" }
    );
    expect(currentApplied.ok && intentApplied.ok).toBe(true);
    if (!currentApplied.ok || !intentApplied.ok) return;

    const result = mergeField(base, currentApplied.doc, intentApplied.doc);
    expect(result.status).not.toBe("conflict");
    const raw = extractRawRows(result.merged as typeof base);
    expect(raw).not.toHaveProperty("error");
    if ("error" in raw) return;
    // Concurrent empty-cell pairing may not three-way-merge every value, but
    // the demo 5-col schema must survive (Langfuse collapse was to 2 columns).
    expect(raw.headers).toEqual([...DV_TRACEABILITY_HEADERS]);
    expect(raw.dataRows[0]).toHaveLength(5);
    expect(raw.dataRows[0]?.some((cell) => cell === "SYS-006" || cell === "RMF-12")).toBe(
      true
    );
  });
});
