import type { JSONContent } from "@tiptap/core";
import { markdownToDoc, markdownToPlainText } from "@/lib/tiptap/markdown-to-doc";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import {
  acceptSuggestionMarksById,
  type InjectAttrs,
  type LocateStatus,
} from "@/lib/suggestions/locator";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import {
  WORD_DIFF_MIN_SIMILARITY,
  buildWordDiffParagraph,
  wordSimilarity,
} from "@/lib/suggestions/word-diff";

/**
 * Whole-block / whole-row ops for the field diff (see `diff-redraft.ts`):
 * replace / insert / delete a top-level block, or insert / delete a table row,
 * by rendering markdown → nodes and tracking the change with the standard
 * suggestion marks, so it previews and accepts as one unit and
 * `acceptSuggestionMarksById` / `stripSuggestionMarksById` finalize / revert it.
 *
 * Word-level prose tweaks and in-place cell edits stay on the ordinary
 * anchored `ai_fix` path.
 */
export type BlockEditOp = {
  op: "replace" | "insert" | "delete" | "insertRow" | "deleteRow";
  /** Target block (replace/delete) or the block to insert after (insert). */
  anchor: string;
  /** Position fallback when the anchor text is not unique. */
  blockIndex: number;
  /** Markdown for the new block (replace/insert) or new row (insertRow). */
  proposedMarkdown?: string;
  /** insertRow/deleteRow: which table (0-based among tables in the field). */
  tableIndex?: number;
  /**
   * deleteRow: row to remove. insertRow: insert after this row
   * (0 = after header).
   */
  rowIndex?: number;
  /** Signature of the target/after row (typically first-cell text). */
  rowAnchor?: string;
  /** replace: how many current top-level blocks to consume (default 1). */
  blockCount?: number;
};

function norm(text: string): string {
  return collapseWhitespace(text).trim();
}

function nodeText(node: JSONContent): string {
  return norm(richJsonToPlainText(node, { tableFormat: "markdown" }));
}

/** Add `markName` (carrying `attrs`) to every text node under `node`. */
function markAllText(node: JSONContent, markName: string, attrs: InjectAttrs): void {
  if (node.type === "text") {
    node.marks = [...(node.marks ?? []), { type: markName, attrs: { ...attrs } }];
    return;
  }
  node.content?.forEach((ch) => markAllText(ch, markName, attrs));
}

function renderInsertBlocks(markdown: string, attrs: InjectAttrs): JSONContent[] {
  const doc = markdownToDoc(markdown);
  const blocks = doc.content ?? [];
  for (const b of blocks) markAllText(b, suggestionInsertMarkName, attrs);
  return blocks;
}

/**
 * Resolve the top-level block index this op targets. Prefers a unique anchor
 * text match; falls back to `blockIndex` when the anchor is absent or ambiguous.
 * Returns -1 when it cannot be resolved (the caller leaves the field untouched).
 */
export function locateBlockIndex(doc: JSONContent, op: BlockEditOp): number {
  const content = doc.content ?? [];
  const target = norm(op.anchor);
  if (target.length > 0) {
    const matches: number[] = [];
    content.forEach((node, i) => {
      if (nodeText(node) === target) matches.push(i);
    });
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1 && op.blockIndex >= 0 && matches.includes(op.blockIndex)) {
      return op.blockIndex;
    }
  }
  if (op.blockIndex >= 0 && op.blockIndex < content.length) return op.blockIndex;
  return -1;
}

function rowSignatureFromCells(cells: string[]): string {
  const first = (cells[0] ?? "").trim();
  return first.length > 0 ? first : cells.join(" | ");
}

function rowSignature(row: JSONContent): string {
  return rowSignatureFromCells((row.content ?? []).map((c) => nodeText(c)));
}

/**
 * Resolve a table row index. Prefers a unique `rowAnchor` match; falls back to
 * `rowIndex` when the anchor is absent or ambiguous. Returns -1 when unresolved.
 */
export function locateRowIndex(
  table: JSONContent,
  op: Pick<BlockEditOp, "rowAnchor" | "rowIndex">
): number {
  const rows = table.content ?? [];
  const target = norm(op.rowAnchor ?? "");
  if (target.length > 0) {
    const matches: number[] = [];
    rows.forEach((row, i) => {
      if (rowSignature(row) === target) matches.push(i);
    });
    if (matches.length === 1) return matches[0]!;
    if (
      matches.length > 1 &&
      op.rowIndex != null &&
      op.rowIndex >= 0 &&
      matches.includes(op.rowIndex)
    ) {
      return op.rowIndex;
    }
  }
  if (op.rowIndex != null && op.rowIndex >= 0 && op.rowIndex < rows.length) {
    return op.rowIndex;
  }
  return -1;
}

/** nth table in the field, used when the table's full-text anchor went stale. */
export function locateTableBlockIndex(doc: JSONContent, op: BlockEditOp): number {
  const content = doc.content ?? [];
  const byAnchor = locateBlockIndex(doc, op);
  if (byAnchor >= 0 && content[byAnchor]?.type === "table") return byAnchor;
  if (op.tableIndex != null && op.tableIndex >= 0) {
    let seen = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i]?.type === "table") {
        if (seen === op.tableIndex) return i;
        seen++;
      }
    }
  }
  return -1;
}

/**
 * Render a single table row from a mini GFM table (header + separator + one
 * data row). Uses the last row of the parsed table so a one-row draft still
 * works if markdown-to-doc treats the first row as a header.
 */
function renderTableRow(markdown: string, asHeader: boolean): JSONContent | null {
  if (!markdown.trim()) return null;
  const parsed = markdownToDoc(markdown);
  const table = parsed.content?.find((n) => n.type === "table");
  if (!table?.content?.length) return null;
  const src =
    table.content.length > 1 ? table.content[table.content.length - 1]! : table.content[0]!;
  const cells = (src.content ?? []).map((cell) => {
    const text = nodeText(cell);
    return {
      type: asHeader ? "tableHeader" : "tableCell",
      content: [
        {
          type: "paragraph",
          content: text ? [{ type: "text", text }] : [],
        },
      ],
    };
  });
  if (cells.length === 0) return null;
  return { type: "tableRow", content: cells };
}

/**
 * Inject tracked-change marks for a block op, producing a preview doc.
 * `status` is "located" on success, or "not_found" when the block can't be
 * resolved (caller must not persist a change in that case).
 */
function injectRowEditMarks(
  cloned: JSONContent,
  op: BlockEditOp,
  attrs: InjectAttrs
): { status: LocateStatus; doc: JSONContent } {
  const content = cloned.content ?? [];
  const tableIdx = locateTableBlockIndex(cloned, op);
  if (tableIdx < 0) return { status: "not_found", doc: cloned };
  const table = content[tableIdx]!;
  if (table.type !== "table") return { status: "not_found", doc: cloned };
  const rows = table.content ?? (table.content = []);

  if (op.op === "deleteRow") {
    const rowIdx = locateRowIndex(table, op);
    if (rowIdx < 0) return { status: "not_found", doc: cloned };
    markAllText(rows[rowIdx]!, suggestionDeleteMarkName, attrs);
    return { status: "located", doc: cloned };
  }

  const markdown = op.proposedMarkdown ?? "";
  if (norm(markdown).length === 0) return { status: "empty_edit", doc: cloned };
  const afterIdx = locateRowIndex(table, op);
  const newRow = renderTableRow(markdown, afterIdx < 0 && rows.length === 0);
  if (!newRow) return { status: "empty_edit", doc: cloned };
  markAllText(newRow, suggestionInsertMarkName, attrs);
  if (afterIdx >= 0) rows.splice(afterIdx + 1, 0, newRow);
  else rows.push(newRow);
  return { status: "located", doc: cloned };
}

/**
 * Inject tracked-change marks for a block op, producing a preview doc.
 * `status` is "located" on success, or "not_found" when the block can't be
 * resolved (caller must not persist a change in that case).
 */
export function injectBlockEditMarks(
  doc: JSONContent,
  op: BlockEditOp,
  attrs: InjectAttrs
): { status: LocateStatus; doc: JSONContent } {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
  const content = cloned.content ?? (cloned.content = []);

  if (op.op === "insert") {
    const markdown = op.proposedMarkdown ?? "";
    if (norm(markdown).length === 0) return { status: "empty_edit", doc };
    const newBlocks = renderInsertBlocks(markdown, attrs);
    const at = op.anchor.trim().length > 0 ? locateBlockIndex(cloned, op) : -1;
    if (at >= 0) content.splice(at + 1, 0, ...newBlocks);
    else content.push(...newBlocks); // append (empty field / unresolved anchor)
    return { status: "located", doc: cloned };
  }

  if (op.op === "insertRow" || op.op === "deleteRow") {
    return injectRowEditMarks(cloned, op, attrs);
  }

  const idx = locateBlockIndex(cloned, op);
  if (idx < 0) return { status: "not_found", doc };

  const count = Math.min(Math.max(1, op.blockCount ?? 1), content.length - idx);

  if (op.op === "replace") {
    const markdown = op.proposedMarkdown ?? "";
    if (norm(markdown).length === 0) return { status: "empty_edit", doc };
    const oldText = content
      .slice(idx, idx + count)
      .map((n) => nodeText(n))
      .join(" ");
    const newPlain = norm(markdownToPlainText(markdown));
    // High token overlap → unified word diff (unchanged words once). Low
    // overlap → strike the old block(s) and insert the new ones after.
    if (wordSimilarity(oldText, newPlain) >= WORD_DIFF_MIN_SIMILARITY) {
      content.splice(idx, count, buildWordDiffParagraph(oldText, newPlain, attrs));
      return { status: "located", doc: cloned };
    }
    for (let i = 0; i < count; i++) {
      markAllText(content[idx + i]!, suggestionDeleteMarkName, attrs);
    }
    const newBlocks = renderInsertBlocks(markdown, attrs);
    content.splice(idx + count, 0, ...newBlocks);
    return { status: "located", doc: cloned };
  }

  // Strike the target block (delete-mark all its text).
  for (let i = 0; i < count; i++) {
    markAllText(content[idx + i]!, suggestionDeleteMarkName, attrs);
  }

  return { status: "located", doc: cloned };
}

/** Apply a block op. Replace splices markdown nodes directly (preview may be a
 * word diff that must not become the applied result). Insert/delete/row still
 * go through marks so preview ≡ apply. */
export function applyBlockEdit(
  doc: JSONContent,
  suggestionId: string,
  op: BlockEditOp,
  attrs?: Partial<InjectAttrs>
): { status: LocateStatus; doc: JSONContent } {
  if (op.op === "replace") {
    const cloned: JSONContent = JSON.parse(JSON.stringify(doc));
    const content = cloned.content ?? (cloned.content = []);
    const idx = locateBlockIndex(cloned, op);
    if (idx < 0) return { status: "not_found", doc };
    const markdown = op.proposedMarkdown ?? "";
    if (norm(markdown).length === 0) return { status: "empty_edit", doc };
    const count = Math.min(Math.max(1, op.blockCount ?? 1), content.length - idx);
    const newBlocks = markdownToDoc(markdown).content ?? [];
    content.splice(idx, count, ...newBlocks);
    if (content.length === 0) content.push({ type: "paragraph" });
    return { status: "located", doc: cloned };
  }

  const fullAttrs: InjectAttrs = {
    id: suggestionId,
    authorId: attrs?.authorId ?? "ai",
    status: "pending",
    createdAt: attrs?.createdAt ?? new Date().toISOString(),
    kind: attrs?.kind ?? "redraft",
  };
  const injected = injectBlockEditMarks(doc, op, fullAttrs);
  if (injected.status !== "located") return injected;
  return {
    status: "located",
    doc: acceptSuggestionMarksById(injected.doc, suggestionId),
  };
}
