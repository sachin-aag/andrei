import { describe, it, expect } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import {
  diffFieldToEdits,
  splitMarkdownIntoBlocks,
  type BlockEdit,
  type TextEdit,
} from "./diff-redraft";

const R = "because the criterion needs it";

describe("splitMarkdownIntoBlocks", () => {
  it("splits paragraphs on blank lines and keeps tables/lists intact", () => {
    const md = "Para one.\n\nPara two.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- a\n- b";
    const out = splitMarkdownIntoBlocks(md);
    expect(out).toHaveLength(4);
    expect(out[2]!.startsWith("| A")).toBe(true);
    expect(out[3]).toBe("- a\n- b");
  });
});

describe("diffFieldToEdits", () => {
  it("returns no edits when nothing changed", () => {
    const md = "First paragraph.\n\nSecond paragraph.";
    const res = diffFieldToEdits(markdownToDoc(md), md, R);
    expect(res).toEqual({ strategy: "edits", edits: [] });
  });

  it("empty field → one insert per proposed block, in order", () => {
    const res = diffFieldToEdits(markdownToDoc(""), "Intro.\n\nBody.", R);
    expect(res.strategy).toBe("edits");
    const edits = (res as { edits: BlockEdit[] }).edits;
    expect(edits).toHaveLength(2);
    expect(edits.every((e) => e.kind === "block" && e.op === "insert")).toBe(true);
    expect(edits[0]!.anchor).toBe("");
  });

  it("one lightly changed paragraph → one word-level text edit, others untouched", () => {
    const current = markdownToDoc(
      "Alpha stays the same here.\n\nThe result was within 90.0% to 110.0% overall."
    );
    const proposed =
      "Alpha stays the same here.\n\nThe result was within 85.0% to 115.0% overall.";
    const res = diffFieldToEdits(current, proposed, R);
    const edits = (res as { edits: TextEdit[] }).edits;
    expect(edits).toHaveLength(1);
    expect(edits[0]!.kind).toBe("text");
    expect(edits[0]!.deleteText).toContain("90.0%");
    expect(edits[0]!.insertText).toContain("85.0%");
    // untouched paragraph is not part of the delete span
    expect(edits[0]!.deleteText).not.toContain("Alpha");
  });

  it("added paragraph → insert; removed paragraph → delete", () => {
    const current = markdownToDoc("Keep one.\n\nKeep two.");
    const added = diffFieldToEdits(current, "Keep one.\n\nKeep two.\n\nBrand new tail.", R);
    const addedEdits = (added as { edits: BlockEdit[] }).edits;
    expect(addedEdits).toHaveLength(1);
    expect(addedEdits[0]!.op).toBe("insert");
    expect(addedEdits[0]!.anchor).toContain("Keep two");

    const removed = diffFieldToEdits(current, "Keep one.", R);
    const removedEdits = (removed as { edits: BlockEdit[] }).edits;
    expect(removedEdits).toHaveLength(1);
    expect(removedEdits[0]!.op).toBe("delete");
    expect(removedEdits[0]!.anchor).toContain("Keep two");
  });

  it("one changed table cell → one cell-scoped text edit", () => {
    const tableMd = "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |";
    const current = markdownToDoc(tableMd);
    const proposed = "| Action | Due |\n| --- | --- |\n| PA-01 | 31/05/2026 |";
    const res = diffFieldToEdits(current, proposed, R);
    const edits = (res as { edits: TextEdit[] }).edits;
    expect(edits).toHaveLength(1);
    expect(edits[0]!.kind).toBe("text");
    expect(edits[0]!.scope).toMatchObject({ kind: "cell", tableIndex: 0, row: 1, col: 1 });
    expect(edits[0]!.insertText).toContain("31/05/2026");
  });

  it("added table row → insertRow; removed table row → deleteRow", () => {
    const currentMd = [
      "| Action | Due |",
      "| --- | --- |",
      "| PA-01 | 30/04/2026 |",
      "| PA-02 | 30/04/2026 |",
    ].join("\n");
    const current = markdownToDoc(currentMd);

    const added = diffFieldToEdits(
      current,
      [
        "| Action | Due |",
        "| --- | --- |",
        "| PA-01 | 30/04/2026 |",
        "| PA-02 | 30/04/2026 |",
        "| PA-03 | 15/06/2026 |",
      ].join("\n"),
      R
    );
    const addedEdits = (added as { edits: BlockEdit[] }).edits;
    expect(addedEdits).toHaveLength(1);
    expect(addedEdits[0]).toMatchObject({
      kind: "block",
      op: "insertRow",
      tableIndex: 0,
      rowAnchor: "PA-02",
    });
    expect(addedEdits[0]!.proposedMarkdown).toContain("PA-03");

    const removed = diffFieldToEdits(
      current,
      ["| Action | Due |", "| --- | --- |", "| PA-01 | 30/04/2026 |"].join("\n"),
      R
    );
    const removedEdits = (removed as { edits: BlockEdit[] }).edits;
    expect(removedEdits).toHaveLength(1);
    expect(removedEdits[0]).toMatchObject({
      kind: "block",
      op: "deleteRow",
      tableIndex: 0,
      rowAnchor: "PA-02",
    });
  });

  it("column count change → whole-table replace, not row ops", () => {
    const current = markdownToDoc(
      "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |"
    );
    const res = diffFieldToEdits(
      current,
      "| Action | Due | Owner |\n| --- | --- | --- |\n| PA-01 | 30/04/2026 | QA |",
      R
    );
    const edits = (res as { edits: BlockEdit[] }).edits;
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({ kind: "block", op: "replace" });
    expect(edits[0]!.proposedMarkdown).toContain("Owner");
  });

  it("two added rows chain so the second inserts after the first proposed row", () => {
    const current = markdownToDoc(
      "| Action | Due |\n| --- | --- |\n| PA-01 | 30/04/2026 |"
    );
    const res = diffFieldToEdits(
      current,
      [
        "| Action | Due |",
        "| --- | --- |",
        "| PA-01 | 30/04/2026 |",
        "| PA-02 | 15/05/2026 |",
        "| PA-03 | 15/06/2026 |",
      ].join("\n"),
      R
    );
    const edits = (res as { edits: BlockEdit[] }).edits;
    expect(edits).toHaveLength(2);
    expect(edits[0]).toMatchObject({ op: "insertRow", rowAnchor: "PA-01" });
    expect(edits[1]).toMatchObject({ op: "insertRow", rowAnchor: "PA-02" });
  });

  it("near-zero overlap → single redraft fallback", () => {
    const current = markdownToDoc("One.\n\nTwo.\n\nThree.");
    const res = diffFieldToEdits(current, "Completely different alpha.\n\nEntirely other beta.", R);
    expect(res.strategy).toBe("redraft");
  });

  it("restructure with high token overlap is targeted edits, not a whole-field redraft", () => {
    const current = markdownToDoc(
      "During visual inspection of batch B1234 on 12/03/2026, white particles were observed. Strings of approximately 2 mm and agglomerates were noted on the stopper. [Time of detection: <to be filled>] [Procedure reference: <to be filled>]"
    );
    const proposed = [
      "### Deviation Description",
      "",
      "During visual inspection of batch B1234 on 12/03/2026, white particles were observed.",
      "",
      "**Strings:**",
      "- approximately 2 mm fibres",
      "",
      "**Agglomerates:**",
      "- clustered particles on the stopper",
    ].join("\n");
    const res = diffFieldToEdits(current, proposed, R);
    expect(res.strategy).toBe("edits");
    const edits = (res as { edits: BlockEdit[] }).edits;
    expect(edits.length).toBeGreaterThan(0);
    expect(edits.length).toBeLessThanOrEqual(2);
    expect(edits[0]).toMatchObject({ kind: "block", op: "replace" });
    expect(edits[0]!.proposedMarkdown).toContain("Deviation Description");
    expect(edits[0]!.proposedMarkdown).toContain("batch B1234");
  });

  it("guarded block (inline equation) is never emitted as a lossy replace", () => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The formula " },
            { type: "mathInline", attrs: { latex: "x^2" } },
            { type: "text", text: " matters." },
          ],
        },
      ],
    };
    const res = diffFieldToEdits(doc, "The formula was rewritten entirely by the model.", R);
    // overlap is 0 but the only block is guarded → nothing lossy emitted.
    expect(res.strategy === "redraft" || (res as { edits: unknown[] }).edits.length === 0).toBe(true);
    if (res.strategy === "edits") expect(res.edits).toHaveLength(0);
  });
});
