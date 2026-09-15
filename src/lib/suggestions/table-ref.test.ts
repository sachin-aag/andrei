import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  ELR_MEDIA_FILL_HEADERS,
  ELR_MONITORING_HEADERS,
  EMPTY_ELR_CONTENT,
} from "@/lib/document-types/elr/sections";
import { seededTableDoc } from "@/lib/document-types/design-verification/sections";
import { cascadeFilledTableCaptionsInSections } from "@/lib/suggestions/document-table-number";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { applyTableOperation } from "@/lib/suggestions/table-operation";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { tableRefNode } from "@/lib/tiptap/table-ref-markdown";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";

describe("tableRef cascade", () => {
  it("updates display N when a table is inserted above", () => {
    const monitoring = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      { section: "elr_monitoring", targetField: "table", existingTableCount: 1 }
    );
    expect(monitoring.ok).toBe(true);
    if (!monitoring.ok) return;

    const narrative = markdownToDoc("See [[table]] for the records.");
    expect(flattenForAnchor(narrative).text).toBe(
      "See the table for the records."
    );

    const before = cascadeFilledTableCaptionsInSections({
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
        elr_monitoring: { narrative, table: monitoring.doc },
      },
    });
    const beforeNarrative = (before.sections.elr_monitoring as {
      narrative: JSONContent;
    }).narrative;
    const beforeRef = beforeNarrative.content![0]!.content!.find(
      (node) => node.type === "tableRef"
    );
    expect(beforeRef?.attrs?.n).toBe(2);
    expect(beforeRef?.attrs?.section).toBe("elr_monitoring");
    expect(beforeRef?.attrs?.targetField).toBe("table");
    expect(flattenForAnchor(beforeNarrative).text).toBe(
      "See Table 2 for the records."
    );

    const mediaFill = applyTableOperation(
      seededTableDoc([...ELR_MEDIA_FILL_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "APS-1" }],
      },
      { section: "elr_media_fill", targetField: "table", existingTableCount: 0 }
    );
    expect(mediaFill.ok).toBe(true);
    if (!mediaFill.ok) return;

    const after = cascadeFilledTableCaptionsInSections({
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
        elr_media_fill: { table: mediaFill.doc },
        elr_monitoring: before.sections.elr_monitoring,
      },
    });
    const afterNarrative = (after.sections.elr_monitoring as {
      narrative: JSONContent;
    }).narrative;
    const afterRef = afterNarrative.content![0]!.content!.find(
      (node) => node.type === "tableRef"
    );
    expect(afterRef?.attrs?.n).toBe(3);
    expect(flattenForAnchor(afterNarrative).text).toBe(
      "See Table 3 for the records."
    );
    expect(richJsonToPlainText(afterNarrative)).toContain("Table 3");
  });

  it("resolves an explicit [[table:Monitoring]] to Table 2 when filled", () => {
    const monitoring = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      { section: "elr_monitoring", targetField: "table", existingTableCount: 1 }
    );
    expect(monitoring.ok).toBe(true);
    if (!monitoring.ok) return;

    const parsed = markdownToDoc("See [[table:Monitoring]].");
    const cascaded = cascadeFilledTableCaptionsInSections({
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
        elr_monitoring: { narrative: parsed, table: monitoring.doc },
      },
    });
    const ref = (
      cascaded.sections.elr_monitoring as { narrative: JSONContent }
    ).narrative.content![0]!.content!.find((node) => node.type === "tableRef");
    expect(ref?.attrs).toMatchObject({
      section: "elr_monitoring",
      targetField: "table",
      tableIndex: 0,
      n: 2,
    });
  });

  it("resolves an explicit [[table:Abbreviations]] to Table 1", () => {
    const parsed = markdownToDoc("See [[table:Abbreviations]].");
    const cascaded = cascadeFilledTableCaptionsInSections({
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
        elr_monitoring: { narrative: parsed },
      },
    });
    const ref = (
      cascaded.sections.elr_monitoring as { narrative: JSONContent }
    ).narrative.content![0]!.content!.find((node) => node.type === "tableRef");
    expect(ref?.attrs).toMatchObject({
      section: "elr_abbreviations",
      targetField: "table",
      tableIndex: 0,
      n: 1,
    });
  });

  it("does not rewrite typed Table N prose when captions cascade", () => {
    const monitoring = applyTableOperation(
      seededTableDoc([...ELR_MONITORING_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "1" }],
      },
      { section: "elr_monitoring", targetField: "table", existingTableCount: 1 }
    );
    expect(monitoring.ok).toBe(true);
    if (!monitoring.ok) return;

    const frozen = markdownToDoc("See Table 2 for the records.");
    const mediaFill = applyTableOperation(
      seededTableDoc([...ELR_MEDIA_FILL_HEADERS]),
      {
        kind: "edit_cells",
        tableIndex: 0,
        cells: [{ row: 1, col: 0, insertText: "APS-1" }],
      },
      { section: "elr_media_fill", targetField: "table", existingTableCount: 0 }
    );
    expect(mediaFill.ok).toBe(true);
    if (!mediaFill.ok) return;

    const after = cascadeFilledTableCaptionsInSections({
      documentType: "equipment_lifecycle_report",
      sections: {
        elr_abbreviations: EMPTY_ELR_CONTENT.elr_abbreviations,
        elr_media_fill: { table: mediaFill.doc },
        elr_monitoring: { narrative: frozen, table: monitoring.doc },
      },
    });
    const afterNarrative = (after.sections.elr_monitoring as {
      narrative: JSONContent;
    }).narrative;
    expect(flattenForAnchor(afterNarrative).text).toBe(
      "See Table 2 for the records."
    );
  });

  it("keeps a constructed tableRef display in flatten when n is set", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            tableRefNode({
              section: "elr_monitoring",
              targetField: "table",
              tableIndex: 0,
              n: 2,
            }),
            { type: "text", text: "." },
          ],
        },
      ],
    };
    expect(flattenForAnchor(doc).text).toBe("See Table 2.");
  });
});
