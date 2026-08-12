import { describe, it, expect } from "vitest";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import type { JSONContent } from "@tiptap/core";
import { acceptSuggestionMarksById } from "@/lib/suggestions/locator";
import {
  applyBlockEdit,
  injectBlockEditMarks,
  locateBlockIndex,
  locateRowIndex,
  type BlockEditOp,
} from "./block-redraft";

function text(doc: ReturnType<typeof markdownToDoc>): string {
  return collapseWhitespace(richJsonToPlainText(doc, { tableFormat: "markdown" })).trim();
}

describe("locateBlockIndex", () => {
  it("resolves a unique anchor, else falls back to blockIndex", () => {
    const doc = markdownToDoc("First block.\n\nSecond block.\n\nThird block.");
    expect(
      locateBlockIndex(doc, { op: "replace", anchor: "Second block.", blockIndex: 99 })
    ).toBe(1);
    expect(
      locateBlockIndex(doc, { op: "replace", anchor: "nope", blockIndex: 2 })
    ).toBe(2);
    expect(
      locateBlockIndex(doc, { op: "replace", anchor: "nope", blockIndex: 99 })
    ).toBe(-1);
  });
});

describe("applyBlockEdit", () => {
  it("replace swaps the target block and keeps its neighbours", () => {
    const doc = markdownToDoc("Keep first.\n\nOld middle.\n\nKeep last.");
    const op: BlockEditOp = {
      op: "replace",
      anchor: "Old middle.",
      blockIndex: 1,
      proposedMarkdown: "Brand new middle content.",
    };
    const { status, doc: out } = applyBlockEdit(doc, "s1", op);
    expect(status).toBe("located");
    const t = text(out);
    expect(t).toContain("Keep first.");
    expect(t).toContain("Brand new middle content.");
    expect(t).toContain("Keep last.");
    expect(t).not.toContain("Old middle.");
  });

  it("insert appends when there is no anchor (empty field / append)", () => {
    const doc = markdownToDoc("");
    const op: BlockEditOp = {
      op: "insert",
      anchor: "",
      blockIndex: -1,
      proposedMarkdown: "The first drafted paragraph.",
    };
    const { status, doc: out } = applyBlockEdit(doc, "s2", op);
    expect(status).toBe("located");
    expect(text(out)).toContain("The first drafted paragraph.");
  });

  it("insert places a new block after its anchor", () => {
    const doc = markdownToDoc("Alpha para.\n\nGamma para.");
    const op: BlockEditOp = {
      op: "insert",
      anchor: "Alpha para.",
      blockIndex: 0,
      proposedMarkdown: "Beta para.",
    };
    const { doc: out } = applyBlockEdit(doc, "s3", op);
    const paras = (out.content ?? []).map((n) =>
      collapseWhitespace(richJsonToPlainText(n, { tableFormat: "markdown" })).trim()
    );
    expect(paras).toEqual(["Alpha para.", "Beta para.", "Gamma para."]);
  });

  it("replace with blockCount > 1 consumes several current blocks", () => {
    const doc = markdownToDoc("Alpha.\n\nBravo.\n\nCharlie.\n\nDelta.");
    const op: BlockEditOp = {
      op: "replace",
      anchor: "Bravo.",
      blockIndex: 1,
      blockCount: 2,
      proposedMarkdown: "### Combined\n\nBravo and Charlie rewritten.",
    };
    const { status, doc: out } = applyBlockEdit(doc, "s-span", op);
    expect(status).toBe("located");
    const t = text(out);
    expect(t).toContain("Alpha.");
    expect(t).toContain("Combined");
    expect(t).toContain("Bravo and Charlie rewritten.");
    expect(t).toContain("Delta.");
    expect(t).not.toContain("Bravo.");
    const combined = (out.content ?? []).find(
      (n) =>
        n.type === "paragraph" &&
        (n.content ?? []).some((c) => c.text === "Combined" && c.marks?.some((m) => m.type === "bold"))
    );
    expect(combined).toBeTruthy();
  });

  it("delete removes the target block, keeps the rest", () => {
    const doc = markdownToDoc("Stay one.\n\nRemove me.\n\nStay two.");
    const op: BlockEditOp = { op: "delete", anchor: "Remove me.", blockIndex: 1 };
    const { status, doc: out } = applyBlockEdit(doc, "s4", op);
    expect(status).toBe("located");
    const t = text(out);
    expect(t).toContain("Stay one.");
    expect(t).toContain("Stay two.");
    expect(t).not.toContain("Remove me.");
  });

  it("preserves markdown formatting (a list) when rendering the new block", () => {
    const doc = markdownToDoc("Intro paragraph here.");
    const op: BlockEditOp = {
      op: "replace",
      anchor: "Intro paragraph here.",
      blockIndex: 0,
      proposedMarkdown: "- first item\n- second item",
    };
    const { doc: out } = applyBlockEdit(doc, "s5", op);
    const hasList = (out.content ?? []).some(
      (n) => n.type === "bulletList" || n.type === "orderedList"
    );
    expect(hasList).toBe(true);
  });

  it("insertRow adds a data row after the anchored row", () => {
    const doc = markdownToDoc(
      "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |\n| PA-02 | 30/04/2026 |"
    );
    const table = (doc.content ?? []).find((n) => n.type === "table")!;
    expect(locateRowIndex(table, { rowAnchor: "PA-02", rowIndex: 2 })).toBe(2);

    const op: BlockEditOp = {
      op: "insertRow",
      anchor: "",
      blockIndex: 0,
      tableIndex: 0,
      rowIndex: 2,
      rowAnchor: "PA-02",
      proposedMarkdown: "| Action | Due |\n| --- | --- |\n| PA-03 | 15/06/2026 |",
    };
    const { status, doc: out } = applyBlockEdit(doc, "s6", op);
    expect(status).toBe("located");
    const t = text(out);
    expect(t).toContain("PA-01");
    expect(t).toContain("PA-02");
    expect(t).toContain("PA-03");
    expect(t).toContain("15/06/2026");
  });

  it("deleteRow removes the anchored row and keeps the others", () => {
    const doc = markdownToDoc(
      "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |\n| PA-02 | 30/04/2026 |\n| PA-03 | 15/06/2026 |"
    );
    const op: BlockEditOp = {
      op: "deleteRow",
      anchor: "",
      blockIndex: 0,
      tableIndex: 0,
      rowIndex: 2,
      rowAnchor: "PA-02",
    };
    const { status, doc: out } = applyBlockEdit(doc, "s7", op);
    expect(status).toBe("located");
    const t = text(out);
    expect(t).toContain("PA-01");
    expect(t).toContain("PA-03");
    expect(t).not.toContain("PA-02");
  });
});

describe("block replace preview — structure preserved, preview ≡ apply", () => {
  const ATTRS = {
    id: "s1",
    authorId: "ai",
    status: "pending" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    kind: "redraft" as const,
  };

  /** Node types present anywhere in the doc, so structure loss is visible. */
  function types(doc: JSONContent): string[] {
    const out: string[] = [];
    const walk = (n: JSONContent) => {
      if (n.type && n.type !== "text") out.push(n.type);
      n.content?.forEach(walk);
    };
    walk(doc);
    return out;
  }

  it("keeps a bullet list a bullet list instead of flattening to '- a - b'", () => {
    const doc = markdownToDoc("- Quarantine batch\n- Notify QA");
    const op: BlockEditOp = {
      op: "replace",
      anchor: text(doc),
      blockIndex: 0,
      proposedMarkdown: "- Quarantine batch\n- Notify QA\n- Update the log",
    };
    const { status, doc: preview } = injectBlockEditMarks(doc, op, ATTRS);
    expect(status).toBe("located");
    // Old list struck through + new list inserted, both as real list nodes.
    // The old preview collapsed this into a single flat paragraph.
    expect(types(preview).filter((t) => t === "bulletList")).toHaveLength(2);
    expect(types(preview).filter((t) => t === "listItem")).toHaveLength(5);
    expect(preview.content!.every((b) => b.type === "bulletList")).toBe(true);
  });

  it("keeps a table a table instead of flattening to pipe text", () => {
    const doc = markdownToDoc("| A | B |\n| --- | --- |\n| 1 | 2 |");
    const op: BlockEditOp = {
      op: "replace",
      anchor: text(doc),
      blockIndex: 0,
      proposedMarkdown: "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |",
    };
    const { doc: preview } = injectBlockEditMarks(doc, op, ATTRS);
    expect(types(preview).filter((t) => t === "table")).toHaveLength(2);
    expect(types(preview)).toContain("tableCell");
  });

  it("does not demote a heading-style block to a bare paragraph", () => {
    const doc = markdownToDoc("- Alpha item");
    const op: BlockEditOp = {
      op: "replace",
      anchor: text(doc),
      blockIndex: 0,
      proposedMarkdown: "- Alpha item revised",
    };
    const { doc: preview } = injectBlockEditMarks(doc, op, ATTRS);
    expect(types(preview)).toContain("bulletList");
  });

  it("still uses the compact word diff for a plain prose tweak", () => {
    const doc = markdownToDoc("The result was within 90.0% of target.");
    const op: BlockEditOp = {
      op: "replace",
      anchor: "The result was within 90.0% of target.",
      blockIndex: 0,
      proposedMarkdown: "The result was within 85.0% of target.",
    };
    const { doc: preview } = injectBlockEditMarks(doc, op, ATTRS);
    // One paragraph, unchanged words shown once.
    expect(preview.content).toHaveLength(1);
    expect(preview.content![0]!.type).toBe("paragraph");
    const t = text(preview);
    expect(t).toContain("90.0%");
    expect(t).toContain("85.0%");
    expect(t.match(/within/g)).toHaveLength(1);
  });

  it("accepting the preview yields exactly the preview's inserted content", () => {
    const cases: Array<{ current: string; proposed: string }> = [
      { current: "- Alpha\n- Beta", proposed: "- Alpha\n- Beta\n- Gamma" },
      {
        current: "| A | B |\n| --- | --- |\n| 1 | 2 |",
        proposed: "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |",
      },
      { current: "Plain old text here.", proposed: "Plain new text here." },
      { current: "One para.", proposed: "**Bold** replacement." },
    ];
    for (const { current, proposed } of cases) {
      const doc = markdownToDoc(current);
      const op: BlockEditOp = {
        op: "replace",
        anchor: text(doc),
        blockIndex: 0,
        proposedMarkdown: proposed,
      };
      const { doc: preview } = injectBlockEditMarks(doc, op, ATTRS);
      const accepted = acceptSuggestionMarksById(preview, ATTRS.id);
      const applied = applyBlockEdit(doc, ATTRS.id, op).doc;
      expect(text(applied)).toBe(text(accepted));
      expect(text(applied)).toBe(text(markdownToDoc(proposed)));
    }
  });

  it("preserves bold in the applied result rather than flattening it", () => {
    const doc = markdownToDoc("Plain sentence about the batch.");
    const op: BlockEditOp = {
      op: "replace",
      anchor: "Plain sentence about the batch.",
      blockIndex: 0,
      proposedMarkdown: "**Bold** sentence about the batch.",
    };
    const { doc: preview } = injectBlockEditMarks(doc, op, ATTRS);
    const marks = JSON.stringify(preview);
    expect(marks).toContain('"bold"');
    expect(JSON.stringify(applyBlockEdit(doc, ATTRS.id, op).doc)).toContain('"bold"');
  });
});
