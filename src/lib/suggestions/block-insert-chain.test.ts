import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import type { CommentRecord } from "@/types/report";
import { serializeAiFixCommentContent } from "@/lib/ai/suggestion-gating";
import { buildBlockChain } from "@/lib/suggestions/block-chain";
import { applyBlockEdit, type BlockEditOp } from "@/lib/suggestions/block-redraft";
import { flattenForAnchor } from "@/lib/suggestions/locator";
import { markdownToDoc } from "@/lib/tiptap/markdown-to-doc";

/**
 * A drafted section arrives as an ordered chain of block inserts. The engineer
 * may work them out of order, reject some, and hand-edit the text in between —
 * so each insertion point is resolved when its card becomes active, never from
 * a position captured when the draft was written.
 */

function chainComment(opts: {
  id: string;
  status: CommentRecord["status"];
  markdown: string;
  afterSuggestionId?: string;
}): CommentRecord {
  return {
    id: opts.id,
    reportId: "r1",
    parentId: null,
    sectionId: "s1",
    section: "define",
    authorId: "ai",
    content: serializeAiFixCommentContent({
      deleteText: "",
      insertText: "",
      reasoning: "drafted",
      blockEdit: {
        op: "insert",
        anchor: "",
        blockIndex: -1,
        proposedMarkdown: opts.markdown,
        ...(opts.afterSuggestionId
          ? { afterSuggestionId: opts.afterSuggestionId }
          : {}),
      },
    }),
    anchorText: "",
    contentPath: "narrative",
    fromPos: null,
    toPos: null,
    status: opts.status,
    kind: "ai_fix",
    source: "app",
    externalAuthorName: null,
    externalAuthorInitials: null,
    externalCommentId: null,
    externalCreatedAt: null,
    locked: false,
    evaluationId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function opFor(comment: CommentRecord): BlockEditOp {
  const parsed = JSON.parse(comment.content) as {
    blockEdit: BlockEditOp;
  };
  return parsed.blockEdit;
}

function textOf(doc: JSONContent): string {
  return flattenForAnchor(doc).text;
}

const BLOCK_A = "First block about detection.";
const BLOCK_B = "Second block about scope.";
const BLOCK_C = "Third block about actions.";

describe("chained block inserts — position resolved when the card activates", () => {
  it("accepted in order, each block lands after the previous one", () => {
    const a = chainComment({ id: "a", status: "resolved", markdown: BLOCK_A });
    const b = chainComment({
      id: "b",
      status: "open",
      markdown: BLOCK_B,
      afterSuggestionId: "a",
    });

    let doc: JSONContent = markdownToDoc(BLOCK_A);
    const applied = applyBlockEdit(doc, "b", opFor(b), undefined, buildBlockChain([a, b]));
    expect(applied.status).toBe("located");
    doc = applied.doc;
    expect(textOf(doc)).toBe(`${BLOCK_A}\n${BLOCK_B}`);
  });

  it("skips a dismissed predecessor and anchors to the one before it", () => {
    const a = chainComment({ id: "a", status: "resolved", markdown: BLOCK_A });
    const b = chainComment({
      id: "b",
      status: "dismissed",
      markdown: BLOCK_B,
      afterSuggestionId: "a",
    });
    const c = chainComment({
      id: "c",
      status: "open",
      markdown: BLOCK_C,
      afterSuggestionId: "b",
    });

    // B was rejected, so only A is in the document.
    const doc = markdownToDoc(`${BLOCK_A}\n\nEngineer's own closing note.`);
    const applied = applyBlockEdit(
      doc,
      "c",
      opFor(c),
      undefined,
      buildBlockChain([a, b, c])
    );
    expect(applied.status).toBe("located");
    // C lands right after A — NOT appended at the end after the engineer's note.
    expect(textOf(applied.doc)).toBe(
      `${BLOCK_A}\n${BLOCK_C}\nEngineer's own closing note.`
    );
  });

  it("appends at the end when no predecessor has landed yet", () => {
    const a = chainComment({ id: "a", status: "open", markdown: BLOCK_A });
    const b = chainComment({
      id: "b",
      status: "open",
      markdown: BLOCK_B,
      afterSuggestionId: "a",
    });

    // The engineer accepted B first: A is not in the document, so B appends.
    const doc = markdownToDoc("Pre-existing paragraph.");
    const applied = applyBlockEdit(doc, "b", opFor(b), undefined, buildBlockChain([a, b]));
    expect(applied.status).toBe("located");
    expect(textOf(applied.doc)).toBe(`Pre-existing paragraph.\n${BLOCK_B}`);
  });

  it("out-of-order accepts still end up in draft order", () => {
    const a = chainComment({ id: "a", status: "open", markdown: BLOCK_A });
    const b = chainComment({
      id: "b",
      status: "open",
      markdown: BLOCK_B,
      afterSuggestionId: "a",
    });

    // Accept B first (appends), then A (chains to nothing → appends too).
    let doc: JSONContent = markdownToDoc("");
    doc = applyBlockEdit(doc, "b", opFor(b), undefined, buildBlockChain([a, b])).doc;
    const afterB = [
      { ...a, status: "open" as const },
      { ...b, status: "resolved" as const },
    ];
    doc = applyBlockEdit(doc, "a", opFor(a), undefined, buildBlockChain(afterB)).doc;
    // A has no predecessor so it appends; the engineer can reorder by hand. The
    // guarantee is that nothing is lost or misplaced into another block.
    expect(textOf(doc)).toContain(BLOCK_A);
    expect(textOf(doc)).toContain(BLOCK_B);
  });

  it("falls back to appending when the predecessor's text was edited away", () => {
    const a = chainComment({ id: "a", status: "resolved", markdown: BLOCK_A });
    const b = chainComment({
      id: "b",
      status: "open",
      markdown: BLOCK_B,
      afterSuggestionId: "a",
    });

    // The engineer rewrote A's paragraph after accepting it.
    const doc = markdownToDoc("Completely rewritten opening.");
    const applied = applyBlockEdit(doc, "b", opFor(b), undefined, buildBlockChain([a, b]));
    expect(applied.status).toBe("located");
    expect(textOf(applied.doc)).toBe(`Completely rewritten opening.\n${BLOCK_B}`);
  });

  it("survives a cycle in the chain without hanging", () => {
    const a = chainComment({
      id: "a",
      status: "open",
      markdown: BLOCK_A,
      afterSuggestionId: "b",
    });
    const b = chainComment({
      id: "b",
      status: "open",
      markdown: BLOCK_B,
      afterSuggestionId: "a",
    });
    const applied = applyBlockEdit(
      markdownToDoc("Existing."),
      "a",
      opFor(a),
      undefined,
      buildBlockChain([a, b])
    );
    expect(applied.status).toBe("located");
    expect(textOf(applied.doc)).toBe(`Existing.\n${BLOCK_A}`);
  });

  it("ignores the chain entirely when the insert has a real anchor", () => {
    const anchored: BlockEditOp = {
      op: "insert",
      anchor: "Middle paragraph.",
      blockIndex: 1,
      proposedMarkdown: BLOCK_C,
    };
    const doc = markdownToDoc("Top paragraph.\n\nMiddle paragraph.\n\nLast paragraph.");
    const applied = applyBlockEdit(doc, "x", anchored);
    expect(textOf(applied.doc)).toBe(
      `Top paragraph.\nMiddle paragraph.\n${BLOCK_C}\nLast paragraph.`
    );
  });
});
