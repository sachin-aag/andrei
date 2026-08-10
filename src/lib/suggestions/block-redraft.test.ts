import { describe, it, expect } from "vitest";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import { applyBlockEdit, locateBlockIndex, locateRowIndex, type BlockEditOp } from "./block-redraft";

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
