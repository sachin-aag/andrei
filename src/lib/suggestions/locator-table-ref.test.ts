import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  acceptSuggestionMarksById,
  applyAndAcceptRichEdit,
  applyEditToRichDoc,
  commitSuggestionMarksById,
  flattenForAnchor,
  probeRichEdit,
  stripSuggestionMarksById,
} from "@/lib/suggestions/locator";
import { narrativeHasSuggestionMarks } from "@/lib/suggestions/apply-narrative-suggestion";
import { tableRefNode } from "@/lib/tiptap/table-ref-markdown";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

const ATTRS = {
  id: "sug-table-ref",
  authorId: "ai",
  status: "pending" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  kind: "fix" as const,
};

function monitoringRef(n: number | null): JSONContent {
  return tableRefNode({
    section: "elr_monitoring",
    targetField: "table",
    tableIndex: 0,
    n,
  });
}

function prose(...inline: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: inline }],
  };
}

function walkMarks(
  doc: JSONContent,
  visit: (node: JSONContent) => void
): void {
  visit(doc);
  for (const child of doc.content ?? []) walkMarks(child, visit);
}

describe("locator — tableRef atoms", () => {
  it("registers a locatable slice for the live Table N label", () => {
    const doc = prose(
      { type: "text", text: "as " },
      monitoringRef(8),
      { type: "text", text: " detailed in " },
      monitoringRef(8),
      { type: "text", text: "." }
    );
    const index = flattenForAnchor(doc);
    expect(index.text).toBe("as Table 8 detailed in Table 8.");
    const first = index.text.indexOf("Table 8");
    const slices = index.resolveRange(first, first + "Table 8".length);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.node.type).toBe("tableRef");
  });

  it("marks the whole REF red when delete overlaps Table N, then accept drops it", () => {
    const doc = prose(
      { type: "text", text: "See " },
      monitoringRef(2),
      { type: "text", text: " for the records." }
    );
    expect(probeRichEdit(doc, {
      anchorText: "Table 2",
      deleteText: "Table 2",
      insertText: "the attached table",
    })).toBe("located");

    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: "Table 2",
        deleteText: "Table 2",
        insertText: "the attached table",
      },
      ATTRS
    );
    expect(preview.status).toBe("located");
    const refs: JSONContent[] = [];
    walkMarks(preview.doc, (node) => {
      if (node.type === "tableRef") refs.push(node);
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]?.marks?.some((m) => m.type === suggestionDeleteMarkName)).toBe(
      true
    );
    expect(JSON.stringify(preview.doc)).toContain(suggestionInsertMarkName);

    const accepted = acceptSuggestionMarksById(preview.doc, ATTRS.id);
    expect(flattenForAnchor(accepted).text).toBe(
      "See the attached table for the records."
    );
    let leftover = false;
    walkMarks(accepted, (node) => {
      if (node.type === "tableRef") leftover = true;
    });
    expect(leftover).toBe(false);
  });

  it("does not insert a second green Table 8 beside an existing REF", () => {
    const doc = prose(
      { type: "text", text: "as " },
      monitoringRef(8),
      { type: "text", text: " detailed in " },
      monitoringRef(8),
      { type: "text", text: "." }
    );
    const accepted = applyAndAcceptRichEdit(
      doc,
      ATTRS.id,
      {
        anchorText: "Table 8",
        deleteText: "",
        insertText: "Table 8",
      },
      ATTRS
    );
    // Two live REFs make a bare "Table 8" anchor ambiguous — do not duplicate.
    expect(accepted.status).toBe("ambiguous");
    expect(flattenForAnchor(doc).text).toBe("as Table 8 detailed in Table 8.");
  });

  it("does not keep typed Table 1 beside an inserted [[table]] ref", () => {
    const sentence =
      "The specific roles and functional responsibilities for the generation, technical review, and approval of this Equipment Lifecycle Report are outlined in Table 1.";
    const doc = prose({ type: "text", text: sentence });
    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: sentence,
        deleteText: "",
        insertText: `${sentence.slice(0, -1)} [[table]], which encompasses Quality Assurance.`,
      },
      ATTRS
    );
    expect(preview.status).toBe("located");
    const inline = preview.doc.content![0]!.content ?? [];
    const refs = inline.filter((node) => node.type === "tableRef");
    const insertedTableOnes = inline.flatMap((node) => {
      if (node.type !== "text" || !/\bTable 1\b/.test(node.text ?? "")) {
        return [];
      }
      const inserted = (node.marks ?? []).some(
        (mark) => mark.type === suggestionInsertMarkName
      );
      return inserted ? [node.text] : [];
    });
    expect(refs).toHaveLength(1);
    expect(insertedTableOnes).toEqual([]);
    const accepted = acceptSuggestionMarksById(preview.doc, ATTRS.id);
    expect(flattenForAnchor(accepted).text).toBe(
      "The specific roles and functional responsibilities for the generation, technical review, and approval of this Equipment Lifecycle Report are outlined in the table, which encompasses Quality Assurance."
    );
  });

  it("still appends a short insert after a unique sentence", () => {
    const sentence =
      "The specific roles and functional responsibilities for the generation, technical review, and approval of this Equipment Lifecycle Report are outlined in Table 1.";
    const doc = prose({ type: "text", text: sentence });
    const preview = applyEditToRichDoc(
      doc,
      {
        anchorText: sentence,
        deleteText: "",
        insertText: " Quality Assurance prepares the report.",
      },
      ATTRS
    );
    expect(preview.status).toBe("located");
    expect(flattenForAnchor(preview.doc).text).toBe(
      `${sentence}Quality Assurance prepares the report.`
    );
  });

  it("accept keeps an insert-marked REF and strip removes it", () => {
    const inserted = tableRefNode(
      {
        section: "elr_monitoring",
        targetField: "table",
        tableIndex: 0,
        n: 3,
      },
      [{ type: suggestionInsertMarkName, attrs: { ...ATTRS } }]
    );
    const doc = prose(
      { type: "text", text: "See " },
      inserted,
      { type: "text", text: "." }
    );
    expect(narrativeHasSuggestionMarks(doc, ATTRS.id)).toBe(true);
    const accepted = acceptSuggestionMarksById(doc, ATTRS.id);
    const kept = accepted.content![0]!.content!.find((n) => n.type === "tableRef");
    expect(kept).toBeTruthy();
    expect(kept?.marks ?? []).toEqual([]);
    expect(flattenForAnchor(accepted).text).toBe("See Table 3.");

    const stripped = stripSuggestionMarksById(doc, ATTRS.id);
    expect(
      stripped.content![0]!.content!.some((n) => n.type === "tableRef")
    ).toBe(false);
    expect(flattenForAnchor(stripped).text).toBe("See .");
  });

  it("dismiss of a delete-marked REF restores the unmarked atom", () => {
    const marked = tableRefNode(
      {
        section: "elr_monitoring",
        targetField: "table",
        tableIndex: 0,
        n: 2,
      },
      [{ type: suggestionDeleteMarkName, attrs: { ...ATTRS } }]
    );
    const doc = prose(
      { type: "text", text: "See " },
      marked,
      { type: "text", text: "." }
    );
    const restored = stripSuggestionMarksById(doc, ATTRS.id);
    const ref = restored.content![0]!.content!.find((n) => n.type === "tableRef");
    expect(ref).toBeTruthy();
    expect(ref?.marks ?? []).toEqual([]);
    expect(flattenForAnchor(restored).text).toBe("See Table 2.");
  });

  it("commits pending REF marks to accepted tracked changes", () => {
    const inserted = tableRefNode(
      {
        section: "elr_monitoring",
        targetField: "table",
        tableIndex: 0,
        n: 1,
      },
      [{ type: suggestionInsertMarkName, attrs: { ...ATTRS } }]
    );
    const doc = prose(inserted);
    const committed = commitSuggestionMarksById(doc, ATTRS.id);
    const ref = committed.content![0]!.content![0]!;
    expect(ref.type).toBe("tableRef");
    expect(ref.marks?.[0]?.attrs).toMatchObject({
      id: ATTRS.id,
      status: "accepted",
    });
  });
});
