import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  CVP_SHELL_CALC_HEADERS,
  cvpEquipmentSamplingSeed,
} from "@/lib/document-types/cvp/sections";
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
import { moveCitationsToEndOfText } from "@/lib/suggestions/citations-at-end";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";

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

  it("lands both edits in place when the user and the AI changed the same paragraph", () => {
    const base = doc(para("The pump was cleaned. Swab results passed."));
    const current = doc(para("The pump was cleaned on Monday. Swab results passed."));
    const intent = doc(para("The pump was cleaned. Swab results passed all limits."));
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("clean");
    expect(result.merged).toEqual(
      doc(para("The pump was cleaned on Monday. Swab results passed all limits."))
    );
  });

  it("merges a word replacement and an insert in one sentence", () => {
    const base = "Rinse the vessel with water and dry it.";
    const current = "Rinse the vessel with purified water and dry it.";
    const intent = "Rinse the vessel with water and air-dry it for 30 minutes.";
    expect(mergeField(base, current, intent).merged).toBe(
      "Rinse the vessel with purified water and air-dry it for 30 minutes."
    );
  });

  it("keeps bold and inline atoms in a paragraph both sides edited", () => {
    const bold = (text: string): JSONContent => ({
      type: "text",
      text,
      marks: [{ type: "bold" }],
    });
    const ref: JSONContent = { type: "tableRef", attrs: { refId: "t1" } };
    const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
    const t = (text: string): JSONContent => ({ type: "text", text });
    const base = doc(p(t("Use "), bold("WFI"), t(" for rinse, see "), ref, t(".")));
    const current = doc(p(t("Use "), bold("WFI"), t(" for final rinse, see "), ref, t(".")));
    const intent = doc(p(t("Always use "), bold("WFI"), t(" for rinse, see "), ref, t(".")));
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("clean");
    expect(result.merged).toEqual(
      doc(p(t("Always use "), bold("WFI"), t(" for final rinse, see "), ref, t(".")))
    );
  });

  it("keeps a paragraph the user added where they added it", () => {
    const base = doc(para("Alpha."), para("Beta."), para("Gamma."));
    const current = doc(para("New intro."), para("Alpha."), para("Beta."), para("Gamma."));
    const intent = doc(para("Alpha."), para("Beta two."), para("Gamma."));
    expect(mergeField(base, current, intent).merged).toEqual(
      doc(para("New intro."), para("Alpha."), para("Beta two."), para("Gamma."))
    );
  });

  it("inserts the AI's new paragraph in place, not at the end", () => {
    const base = doc(para("Alpha."), para("Beta."), para("Gamma."));
    const current = doc(para("Alpha edited."), para("Beta."), para("Gamma."));
    const intent = doc(para("Alpha."), para("Inserted."), para("Beta."), para("Gamma."));
    expect(mergeField(base, current, intent).merged).toEqual(
      doc(para("Alpha edited."), para("Inserted."), para("Beta."), para("Gamma."))
    );
  });

  it("applies the rest of the paragraph when one phrase overlaps", () => {
    const base = doc(para("Hold time is 24 hours. Rinse with water."));
    const current = doc(para("Hold time is 48 hours. Rinse with water."));
    const intent = doc(para("Hold time is 72 hours. Rinse with purified water."));
    const result = mergeField(base, current, intent);
    expect(result.status).toBe("conflict");
    expect(result.merged).toEqual(doc(para("Hold time is 48 hours. Rinse with purified water.")));
  });

  it("does not invent a Citations duplicate after merge", () => {
    const result = mergeField(
      FIXTURES.citations,
      FIXTURES.citations,
      FIXTURES.citations
    );
    expect(planFieldDiff(result.merged, FIXTURES.citations)).toEqual([]);
  });

  it("keeps parked citations on Agent draft_field commit (current === base)", () => {
    const base = doc(para("The assay failed at 68 percent."));
    const parkedMarkdown = moveCitationsToEndOfText(
      "The assay failed at 68 percent [protocol.pdf, p. 4]."
    );
    const intent = markdownToDoc(parkedMarkdown);
    const result = mergeField(base, base, intent);
    const merged = JSON.stringify(result.merged);
    expect(merged).toContain("[1]");
    expect(merged).toContain("[protocol.pdf, p. 4]");
    expect(merged).toMatch(/Citations/i);
  });

  it("keeps parked citations on unchanged prose while another line diverges", () => {
    const base = doc(
      para("The assay failed at 68 percent."),
      para("Batch traceability was documented.")
    );
    const current = doc(
      para("The assay failed at 68 percent."),
      para("Batch traceability was documented on B-2024-117.")
    );
    const parkedMarkdown = moveCitationsToEndOfText(
      [
        "The assay failed at 68 percent [protocol.pdf, p. 4].",
        "Batch traceability was documented.",
      ].join("\n")
    );
    const intent = markdownToDoc(parkedMarkdown);
    const result = mergeField(base, current, intent);
    const merged = JSON.stringify(result.merged);
    expect(merged).toContain("B-2024-117");
    expect(merged).toContain("[protocol.pdf, p. 4]");
    expect(merged).toMatch(/Citations/i);
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
    expect(result.status).toBe("clean");
    const raw = extractRawRows(result.merged as typeof base);
    expect(raw).not.toHaveProperty("error");
    if ("error" in raw) return;
    expect(raw.headers).toEqual([...DV_TRACEABILITY_HEADERS]);
    expect(raw.dataRows[0]).toEqual(["SYS-006", "", "", "", "RMF-12"]);
  });
});

describe("mergeField on a multi-table CVP equipment box", () => {
  const ctx = { section: "cvp_equipment_sampling", targetField: "items.0" } as const;

  function cellText(doc: JSONContent, table: number, row: number, col: number): string {
    const tables: JSONContent[] = [];
    const walk = (node: JSONContent) => {
      if (node.type === "table") tables.push(node);
      else (node.content ?? []).forEach(walk);
    };
    walk(doc);
    const text = (node: JSONContent | undefined): string =>
      !node ? "" : node.type === "text" ? (node.text ?? "") : (node.content ?? []).map(text).join("");
    return text(tables[table]?.content?.[row]?.content?.[col]);
  }

  it("keeps filled cells in place while applying a prose edit next to a new caption", () => {
    const base = cvpEquipmentSamplingSeed(1);
    const filled = applyTableOperation(
      base,
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [
          { row: 1, col: 1, insertText: "10k L" },
          { row: 2, col: 1, insertText: "MSGL" },
          { row: 3, col: 2, insertText: "Equipment Drawing / CPDR" },
        ],
      },
      ctx
    );
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    const created = applyTableOperation(
      filled.doc,
      {
        kind: "create_table",
        headers: [...CVP_SHELL_CALC_HEADERS],
        rows: [
          ["Shell height (H)", "NA", "", ""],
          ["No. of horizontal levels", "", "", ""],
        ],
      },
      ctx
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const tables: JSONContent[] = [];
    const walk = (node: JSONContent) => {
      if (node.type === "table") tables.push(node);
      else (node.content ?? []).forEach(walk);
    };
    walk(created.doc);
    const shellIndex = tables.length - 1;
    const shell = applyTableOperation(
      created.doc,
      {
        kind: "edit_cells",
        tableIndex: shellIndex,
        cells: [{ row: 1, col: 2, insertText: "3.18 m" }],
      },
      ctx
    );
    expect(shell.ok).toBe(true);
    if (!shell.ok) return;
    const firstTable = (base.content ?? []).findIndex((node) => node.type === "table");
    const current: JSONContent = {
      ...shell.doc,
      content: [
        ...(shell.doc.content ?? []).slice(0, firstTable),
        para("Table 14. Equipment sampling"),
        ...(shell.doc.content ?? []).slice(firstTable),
      ],
    };
    const intent: JSONContent = {
      ...base,
      content: (base.content ?? []).map((node, i) =>
        i === firstTable - 1
          ? para("Equipment details are established from the engineering drawings.")
          : node
      ),
    };

    const result = mergeField(base, current, intent);
    expect(result.status).toBe("clean");
    const merged = result.merged as JSONContent;
    expect(cellText(merged, 0, 1, 1)).toBe("10k L");
    expect(cellText(merged, 0, 2, 1)).toBe("MSGL");
    expect(cellText(merged, 0, 3, 2)).toBe("Equipment Drawing / CPDR");
    expect(cellText(merged, 0, 1, 2)).toBe("");
    expect(cellText(merged, shellIndex, 1, 2)).toBe("3.18 m");
    expect(cellText(merged, shellIndex, 2, 2)).toBe("");
    const text = JSON.stringify(merged);
    expect(text).toContain("Equipment details are established from the engineering drawings.");
    expect(text).toContain("Table 14. Equipment sampling");
  });

  it("keeps [n] markers on live cells when the intent adds its own citation", () => {
    const base = doc(para("Intro."), seededTableDoc(["A", "B"]).content![0]!);
    const current = applyTableOperation(
      base,
      { kind: "edit_cells", tableIndex: 0, cells: [{ row: 1, col: 0, insertText: "10k L [1]" }] },
      { section: "traceability", targetField: "table" }
    );
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    const live = doc(
      ...(current.doc.content ?? []),
      para(""),
      para("Citations:"),
      para("1. [cpdr.pdf, p. 2]")
    );
    const intent = doc(
      para("Intro per drawing [1]."),
      base.content![1]!,
      para(""),
      para("Citations:"),
      para("1. [drawing.pdf, p. 5]")
    );
    const result = mergeField(base, live, intent);
    const text = JSON.stringify(result.merged);
    expect(text).toContain("10k L [1]");
    expect(text).toContain("Intro per drawing [2].");
    expect(text).toContain("1. [cpdr.pdf, p. 2]");
    expect(text).toContain("2. [drawing.pdf, p. 5]");
  });
});

describe("tableRef vs typed Table N", () => {
  it("is a noop when live REFs already display the typed Table N labels", () => {
    const live = doc(
      para("as ", [
        {
          type: "tableRef",
          attrs: {
            section: "elr_monitoring",
            targetField: "table",
            tableIndex: 0,
            n: 8,
          },
        },
        { type: "text", text: " detailed in " },
        {
          type: "tableRef",
          attrs: {
            section: "elr_monitoring",
            targetField: "table",
            tableIndex: 0,
            n: 8,
          },
        },
        { type: "text", text: "." },
      ])
    );
    const typed = doc(para("as Table 8 detailed in Table 8."));
    const result = mergeField(live, live, typed);
    expect(result.status).toBe("noop");
    expect(result.operations).toEqual([]);
    expect(JSON.stringify(result.merged)).toContain("tableRef");
    expect(JSON.stringify(result.merged)).not.toMatch(/"text":"Table 8"/);
  });
});
