import type { JSONContent } from "@tiptap/core";
import { markdownToPlainText, markdownToDoc } from "@/lib/tiptap/markdown-to-doc";
import { richJsonToPlainText } from "@/lib/tiptap/rich-text";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import {
  isApplyableStatus,
  probeRichEdit,
  type EditScope,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import {
  WORD_DIFF_MIN_SIMILARITY,
  alignSequences,
  wordSimilarity,
  type AlignOp,
} from "@/lib/suggestions/word-diff";

/**
 * Structural diff of a proposed full-field markdown draft against the current
 * field content. Emits the minimal set of targeted, mergeable edits so a draft
 * touches only what changed — unchanged prose blocks and unchanged table cells
 * are left alone (see plan: "Turn whole-field drafts into minimal edits").
 *
 * Pure and DB-free so it is unit-testable in isolation.
 */

/**
 * A minimal anchored text change (word-level tweak inside a prose block) or a
 * cell-scoped change — both persist as ordinary `ai_fix` edits and reuse the
 * existing apply + inline tracked-change preview. `scope` present ⇒ cell edit.
 */
export type TextEdit = {
  kind: "text";
  anchorText: string;
  deleteText: string;
  insertText: string;
  scope?: EditScope;
  reasoning: string;
  /** Short "what this card changes" label, e.g. "Detection and scope". */
  label: string;
};

/**
 * A whole-block / whole-row change that the anchored `ai_fix` path cannot
 * express. Handled by `block-redraft.ts` (render markdown → nodes, mark, accept
 * as a unit). `op`:
 *  - "replace": current block (`anchor` / `blockIndex`) becomes `proposedMarkdown`.
 *  - "insert":  a new `proposedMarkdown` block goes after `anchor`/`blockIndex`
 *               (blockIndex = -1 ⇒ append when the field is empty).
 *  - "delete":  the current block (`anchor` / `blockIndex`) is removed.
 *  - "insertRow" / "deleteRow": one table row; `rowAnchor` + `rowIndex` locate
 *               the target/after row, `tableIndex` locates the table.
 */
export type BlockEdit = {
  kind: "block";
  op: "replace" | "insert" | "delete" | "insertRow" | "deleteRow";
  anchor: string;
  blockIndex: number;
  proposedMarkdown?: string;
  tableIndex?: number;
  rowIndex?: number;
  rowAnchor?: string;
  /** replace: how many current top-level blocks this op consumes (default 1). */
  blockCount?: number;
  reasoning: string;
  /** Short "what this card changes" label, e.g. "Detection and scope". */
  label: string;
  /**
   * insert only: index into THIS diff's edit array of the block that precedes
   * this one. The caller turns it into `afterSuggestionId` so the insertion
   * point is resolved against the live document when the card becomes active,
   * rather than frozen to a position that later edits invalidate.
   */
  afterEditIndex?: number;
};

export type DiffEdit = TextEdit | BlockEdit;

/** Below this token similarity a changed prose block is a rewrite, not a tweak. */
const WORD_MODE_SIMILARITY = WORD_DIFF_MIN_SIMILARITY;
/**
 * More targeted cards than this and a draft is as unreviewable as one giant
 * card, so the diff collapses to a single whole-field block replace. Note this
 * is a *block* replace, not a whole-field redraft: it still previews as real
 * nodes and accepts through the same marks path as every other block edit.
 */
const MAX_TARGETED_EDITS = 12;

const MAX_LABEL_WORDS = 8;
const MAX_LABEL_CHARS = 60;

/**
 * Short label for the suggestion card, so a multi-block draft reads as
 * "Step 2 of 5 — Detection and scope" instead of repeating one `reasoning`
 * string on every card. Derived from the block's own first line.
 */
export function deriveEditLabel(source: string): string {
  const firstLine =
    source
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .find((line) => line.trim().length > 0) ?? "";
  const stripped = collapseWhitespace(firstLine)
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^([-*+]|\d+[.)])\s+/, "")
    .replace(/^\|\s*/, "")
    .replace(/\s*\|\s*$/, "")
    .replace(/\s*\|\s*/g, " · ")
    .replace(/[*_`]/g, "")
    .trim();
  if (!stripped) return "";
  const words = stripped.split(" ").slice(0, MAX_LABEL_WORDS).join(" ");
  const clipped =
    words.length > MAX_LABEL_CHARS
      ? words.slice(0, MAX_LABEL_CHARS).trimEnd()
      : words;
  return clipped.length < stripped.length ? `${clipped}…` : clipped;
}

type BlockKind = "prose" | "list" | "table" | "other";

type CurrentBlock = {
  node: JSONContent;
  kind: BlockKind;
  text: string;
  guarded: boolean;
};

type ProposedBlock = {
  markdown: string;
  kind: BlockKind;
  text: string;
};

// ---------------------------------------------------------------------------
// text helpers
// ---------------------------------------------------------------------------

function norm(text: string): string {
  return collapseWhitespace(text).trim();
}

function nodeText(node: JSONContent): string {
  return norm(richJsonToPlainText(node, { tableFormat: "markdown" }));
}

function tokenize(text: string): string[] {
  const n = norm(text);
  return n.length === 0 ? [] : n.split(" ");
}

// ---------------------------------------------------------------------------
// rich-content guard: never lossily replace a block holding content the model
// cannot see or express in markdown (inline equations/images, color, sub/super,
// underline, highlight) — flattening would silently delete it.
// ---------------------------------------------------------------------------

const GUARDED_NODE_TYPES = new Set(["imageInline", "mathInline", "mathBlock"]);
const GUARDED_MARK_TYPES = new Set([
  "subscript",
  "superscript",
  "underline",
  "highlight",
]);

function blockHasNonRepresentableContent(node: JSONContent): boolean {
  if (GUARDED_NODE_TYPES.has(node.type ?? "")) return true;
  for (const mark of node.marks ?? []) {
    if (GUARDED_MARK_TYPES.has(mark.type)) return true;
    if (
      mark.type === "textStyle" &&
      (mark.attrs as { color?: unknown } | undefined)?.color != null
    ) {
      return true;
    }
  }
  return (node.content ?? []).some(blockHasNonRepresentableContent);
}

// ---------------------------------------------------------------------------
// block extraction
// ---------------------------------------------------------------------------

function currentBlockKind(type: string | undefined): BlockKind {
  if (type === "paragraph" || type === "heading") return "prose";
  if (type === "bulletList" || type === "orderedList") return "list";
  if (type === "table") return "table";
  return "other";
}

function extractCurrentBlocks(doc: JSONContent): CurrentBlock[] {
  const content = doc.content ?? [];
  return content.map((node) => ({
    node,
    kind: currentBlockKind(node.type),
    text: nodeText(node),
    guarded: blockHasNonRepresentableContent(node),
  }));
}

/**
 * Split a markdown draft into top-level block strings. Blocks are separated by
 * blank lines; a GFM table or a list is a single contiguous run of non-blank
 * lines, so this keeps them intact.
 */
export function splitMarkdownIntoBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length > 0) {
      const joined = cur.join("\n").trim();
      if (joined.length > 0) blocks.push(joined);
    }
    cur = [];
  };
  for (const line of lines) {
    if (line.trim().length === 0) flush();
    else cur.push(line);
  }
  flush();
  return blocks;
}

function proposedBlockKind(markdown: string): BlockKind {
  const lines = markdown.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return "other";
  const pipeLines = lines.filter((l) => l.startsWith("|")).length;
  if (pipeLines >= 2 && pipeLines >= lines.length - 1) return "table";
  const listLines = lines.filter((l) => /^([-*+]\s|\d+[.)]\s)/.test(l)).length;
  if (listLines > 0 && listLines >= lines.length) return "list";
  return "prose";
}

function extractProposedBlocks(markdown: string): ProposedBlock[] {
  return splitMarkdownIntoBlocks(markdown).map((md) => ({
    markdown: md,
    kind: proposedBlockKind(md),
    text: norm(markdownToPlainText(md)),
  }));
}

// ---------------------------------------------------------------------------
// block alignment (LCS on exact text equality, then pair gap leftovers)
// ---------------------------------------------------------------------------

function alignBlocks(current: CurrentBlock[], proposed: ProposedBlock[]): AlignOp[] {
  return alignSequences(
    current.length,
    proposed.length,
    (i, j) => current[i]!.text === proposed[j]!.text
  );
}

type SpanOp =
  | AlignOp
  | { type: "replaceSpan"; cStart: number; cEnd: number; pStart: number; pEnd: number };

/**
 * A 1→N (or M→1) restructure that keeps most wording — e.g. one narrative
 * paragraph becoming a heading + bullets — must not be 1:1 paired as
 * "replace long para with ### heading" plus N inserts. Collapse the gap
 * into one block replace covering the whole span.
 */
function shouldCollapseGap(cBlocks: CurrentBlock[], pBlocks: ProposedBlock[]): boolean {
  if (cBlocks.length === 0 || pBlocks.length === 0) return false;
  if (cBlocks.length === 1 && pBlocks.length === 1) return false;
  if (cBlocks.some((b) => b.guarded || b.kind === "table")) return false;
  if (pBlocks.some((b) => b.kind === "table")) return false;
  const concatSim = wordSimilarity(
    cBlocks.map((b) => b.text).join(" "),
    pBlocks.map((b) => b.text).join(" ")
  );
  if (concatSim < WORD_MODE_SIMILARITY) return false;
  const firstSim = wordSimilarity(cBlocks[0]!.text, pBlocks[0]!.text);
  return firstSim < WORD_MODE_SIMILARITY;
}

function collapseRestructureGaps(
  ops: AlignOp[],
  current: CurrentBlock[],
  proposed: ProposedBlock[]
): SpanOp[] {
  const out: SpanOp[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.type === "equal") {
      out.push(ops[i]!);
      i++;
      continue;
    }
    const start = i;
    while (i < ops.length && ops[i]!.type !== "equal") i++;
    const run = ops.slice(start, i);
    const cIdxs = [
      ...new Set(run.flatMap((o) => (o.type === "insert" ? [] : [o.c]))),
    ].toSorted((a, b) => a - b);
    const pIdxs = [
      ...new Set(run.flatMap((o) => (o.type === "delete" ? [] : [o.p]))),
    ].toSorted((a, b) => a - b);
    const cBlocks = cIdxs.map((k) => current[k]!);
    const pBlocks = pIdxs.map((k) => proposed[k]!);
    if (shouldCollapseGap(cBlocks, pBlocks)) {
      out.push({
        type: "replaceSpan",
        cStart: cIdxs[0]!,
        cEnd: cIdxs[cIdxs.length - 1]!,
        pStart: pIdxs[0]!,
        pEnd: pIdxs[pIdxs.length - 1]!,
      });
    } else {
      out.push(...run);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// table cell diff
// ---------------------------------------------------------------------------

type CellCell = { row: number; col: number; text: string };

function extractCells(tableNode: JSONContent): CellCell[] {
  const cells: CellCell[] = [];
  const rows = tableNode.content ?? [];
  rows.forEach((row, r) => {
    (row.content ?? []).forEach((cell, c) => {
      cells.push({ row: r, col: c, text: nodeText(cell) });
    });
  });
  return cells;
}

/** Common-prefix / common-suffix word boundaries of the change. */
function changeBounds(a: string[], b: string[]): { start: number; endA: number; endB: number } {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { start, endA, endB };
}

/** Minimal enclosing changed span (by words) — used for short cell values. */
function minimalSpan(oldText: string, newText: string): { del: string; ins: string } {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const { start, endA, endB } = changeBounds(a, b);
  return { del: a.slice(start, endA).join(" "), ins: b.slice(start, endB).join(" ") };
}

/**
 * Build a minimal anchored word-level edit for a changed prose block, widening
 * the changed span outward one word at a time until it locates uniquely in the
 * field (short spans like "be" are ambiguous). Returns null when even the whole
 * block can't be anchored — the caller then falls back to a block replace.
 */
function wordLevelEdit(
  currentDoc: JSONContent,
  blockText: string,
  oldText: string,
  newText: string
): { deleteText: string; insertText: string } | null {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  let { start, endA, endB } = changeBounds(a, b);
  if (start === endA && start === endB) return null; // no change

  for (let guard = 0; guard <= a.length; guard++) {
    const del = a.slice(start, endA).join(" ");
    const ins = b.slice(start, endB).join(" ");
    if (del.length > 0) {
      const edit: SuggestionEdit = { anchorText: blockText, deleteText: del, insertText: ins };
      if (isApplyableStatus(probeRichEdit(currentDoc, edit))) {
        return { deleteText: del, insertText: ins };
      }
    }
    // Widen: borrow a common word on the left, else on the right.
    if (start > 0) {
      start--;
    } else if (endA < a.length) {
      endA++;
      endB++;
    } else {
      return null;
    }
  }
  return null;
}

function cellsToRows(cells: CellCell[]): string[][] {
  if (cells.length === 0) return [];
  const maxR = Math.max(...cells.map((c) => c.row));
  const rows: string[][] = [];
  for (let r = 0; r <= maxR; r++) {
    const inRow = cells.filter((c) => c.row === r);
    const maxC = inRow.length ? Math.max(...inRow.map((c) => c.col)) : -1;
    const row: string[] = [];
    for (let c = 0; c <= maxC; c++) {
      row.push(inRow.find((x) => x.col === c)?.text ?? "");
    }
    rows.push(row);
  }
  return rows;
}

function tableColumnCount(rows: string[][]): number | null {
  if (rows.length === 0) return 0;
  const cols = rows[0]!.length;
  if (rows.some((r) => r.length !== cols)) return null;
  return cols;
}

function rowSignatureFromCells(cells: string[]): string {
  const first = (cells[0] ?? "").trim();
  return first.length > 0 ? first : cells.join(" | ");
}

function rowText(cells: string[]): string {
  return cells.map((c) => c.trim()).join(" | ");
}

function headerMostlyChanged(a: string[], b: string[]): boolean {
  if (a.length !== b.length || a.length === 0) return true;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length < 0.5;
}

function rowToMarkdown(header: string[], cells: string[]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const line = (row: string[]) => `| ${row.map(esc).join(" | ")} |`;
  const sep = `| ${header.map(() => "---").join(" | ")} |`;
  return `${line(header)}\n${sep}\n${line(cells)}`;
}

function wholeTableReplace(
  tableNode: JSONContent,
  blockIndex: number,
  proposedMarkdown: string,
  reasoning: string
): DiffEdit[] {
  return [
    {
      kind: "block",
      op: "replace",
      anchor: nodeText(tableNode),
      blockIndex,
      proposedMarkdown,
      reasoning,
      label: deriveEditLabel(proposedMarkdown),
    },
  ];
}

function diffMatchedRow(
  curRow: string[],
  propRow: string[],
  rowIndex: number,
  tableIndex: number,
  reasoning: string
): TextEdit[] | null {
  if (curRow.length !== propRow.length) return null;
  const edits: TextEdit[] = [];
  for (let col = 0; col < curRow.length; col++) {
    if (curRow[col] === propRow[col]) continue;
    const { del, ins } = minimalSpan(curRow[col]!, propRow[col]!);
    edits.push({
      kind: "text",
      anchorText: "",
      deleteText: del,
      insertText: ins,
      scope: { kind: "cell", tableIndex, row: rowIndex, col },
      reasoning,
      label: deriveEditLabel(
        `${curRow[0] ?? ""} · ${propRow[col] || "(cleared)"}`
      ),
    });
  }
  return edits;
}

function diffTable(
  tableNode: JSONContent,
  blockIndex: number,
  tableIndex: number,
  proposedMarkdown: string,
  reasoning: string
): DiffEdit[] {
  const proposedDoc = markdownToDoc(proposedMarkdown);
  const proposedTable = (proposedDoc.content ?? []).find((n) => n.type === "table");
  const curRows = cellsToRows(extractCells(tableNode));
  const propRows = proposedTable ? cellsToRows(extractCells(proposedTable)) : [];
  const curCols = tableColumnCount(curRows);
  const propCols = tableColumnCount(propRows);

  if (
    !proposedTable ||
    curRows.length === 0 ||
    propRows.length === 0 ||
    curCols == null ||
    propCols == null ||
    curCols !== propCols ||
    headerMostlyChanged(curRows[0]!, propRows[0]!)
  ) {
    return wholeTableReplace(tableNode, blockIndex, proposedMarkdown, reasoning);
  }

  const header = curRows[0]!;
  const rowOps = alignSequences(
    curRows.length,
    propRows.length,
    (i, j) => rowText(curRows[i]!) === rowText(propRows[j]!)
  );

  const edits: DiffEdit[] = [];
  let lastAfterCurrentIdx = -1;
  let lastAfterAnchor = "";
  for (const op of rowOps) {
    if (op.type === "equal") {
      lastAfterCurrentIdx = op.c;
      lastAfterAnchor = rowSignatureFromCells(curRows[op.c]!);
      continue;
    }

    if (op.type === "replace") {
      const curRow = curRows[op.c]!;
      const propRow = propRows[op.p]!;
      const cellEdits = diffMatchedRow(curRow, propRow, op.c, tableIndex, reasoning);
      if (!cellEdits) {
        return wholeTableReplace(tableNode, blockIndex, proposedMarkdown, reasoning);
      }
      edits.push(...cellEdits);
      lastAfterCurrentIdx = op.c;
      lastAfterAnchor = rowSignatureFromCells(curRow);
      continue;
    }

    if (op.type === "delete") {
      if (op.c === 0) {
        return wholeTableReplace(tableNode, blockIndex, proposedMarkdown, reasoning);
      }
      edits.push({
        kind: "block",
        op: "deleteRow",
        anchor: nodeText(tableNode),
        blockIndex,
        tableIndex,
        rowIndex: op.c,
        rowAnchor: rowSignatureFromCells(curRows[op.c]!),
        reasoning,
        label: `Remove row: ${deriveEditLabel(rowText(curRows[op.c]!))}`,
      });
      continue;
    }

    if (lastAfterCurrentIdx < 0 || lastAfterAnchor.length === 0) {
      return wholeTableReplace(tableNode, blockIndex, proposedMarkdown, reasoning);
    }
    edits.push({
      kind: "block",
      op: "insertRow",
      anchor: nodeText(tableNode),
      blockIndex,
      tableIndex,
      rowIndex: lastAfterCurrentIdx,
      rowAnchor: lastAfterAnchor,
      proposedMarkdown: rowToMarkdown(header, propRows[op.p]!),
      reasoning,
      label: `Add row: ${deriveEditLabel(rowText(propRows[op.p]!))}`,
    });
    // Chain consecutive inserts: the next row goes after this proposed row
    // once the prior insert has been accepted.
    lastAfterAnchor = rowSignatureFromCells(propRows[op.p]!);
  }
  return edits;
}

// ---------------------------------------------------------------------------
// list item diff
// ---------------------------------------------------------------------------

function extractListItemTexts(listNode: JSONContent): string[] {
  return (listNode.content ?? []).map((item) => nodeText(item));
}

/**
 * Reword one bullet without replacing the whole list. Emits a `listItem`-scoped
 * text edit per changed item — the same scope `propose_edit` accepts, so it
 * reuses the locator's per-item window and the ordinary inline preview.
 *
 * Returns null when items are added or removed: the caller then falls back to a
 * whole-list block replace, whose structural preview already shows unchanged
 * items plainly and the new ones highlighted.
 */
function diffList(
  listNode: JSONContent,
  listIndex: number,
  proposedMarkdown: string,
  reasoning: string
): TextEdit[] | null {
  const proposedDoc = markdownToDoc(proposedMarkdown);
  const proposedList = (proposedDoc.content ?? []).find(
    (n) => n.type === "bulletList" || n.type === "orderedList"
  );
  if (!proposedList) return null;
  if ((listNode.type === "orderedList") !== (proposedList.type === "orderedList")) {
    return null; // bullet ↔ numbered is a structural change
  }

  const curItems = extractListItemTexts(listNode);
  const propItems = extractListItemTexts(proposedList);
  if (curItems.length === 0 || curItems.length !== propItems.length) return null;

  const edits: TextEdit[] = [];
  for (let i = 0; i < curItems.length; i++) {
    const cur = curItems[i]!;
    const prop = propItems[i]!;
    if (cur === prop) continue;
    // Below the word-overlap floor the item was rewritten, not tweaked — a
    // scoped whole-item swap is still the minimal edit for that one bullet.
    const { del, ins } = minimalSpan(cur, prop);
    if (!del && !ins) continue;
    edits.push({
      kind: "text",
      anchorText: "",
      deleteText: del,
      insertText: ins,
      scope: { kind: "listItem", listIndex, index: i },
      reasoning,
      label: deriveEditLabel(prop || cur),
    });
  }
  return edits;
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

export function diffFieldToEdits(
  currentDoc: JSONContent,
  proposedMarkdown: string,
  reasoning: string
): DiffEdit[] {
  const current = extractCurrentBlocks(currentDoc);
  const proposed = extractProposedBlocks(proposedMarkdown);

  const currentHasText = current.some((b) => b.text.length > 0);

  // Empty field → the draft is all-new: one insert per proposed block, chained
  // so each resolves its position from the block before it rather than from a
  // frozen index (see `afterEditIndex`).
  if (!currentHasText) {
    return proposed.map((p, idx) => ({
      kind: "block" as const,
      op: "insert" as const,
      anchor: "",
      blockIndex: -1,
      ...(idx > 0 ? { afterEditIndex: idx - 1 } : {}),
      proposedMarkdown: p.markdown,
      reasoning,
      label: deriveEditLabel(p.markdown),
    }));
  }

  const aligned = alignBlocks(current, proposed);
  const ops = collapseRestructureGaps(aligned, current, proposed);
  const edits: DiffEdit[] = [];
  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi]!;
    if (op.type === "equal") continue;

    if (op.type === "replaceSpan") {
      const c0 = current[op.cStart]!;
      if (c0.guarded) continue;
      const markdown = proposed
        .slice(op.pStart, op.pEnd + 1)
        .map((p) => p.markdown)
        .join("\n\n");
      edits.push({
        kind: "block",
        op: "replace",
        anchor: c0.text,
        blockIndex: op.cStart,
        blockCount: op.cEnd - op.cStart + 1,
        proposedMarkdown: markdown,
        reasoning,
        label: deriveEditLabel(markdown),
      });
      continue;
    }

    if (op.type === "delete") {
      const c = current[op.c]!;
      if (c.guarded) continue; // never remove protected content via a diff
      edits.push({
        kind: "block",
        op: "delete",
        anchor: c.text,
        blockIndex: op.c,
        reasoning,
        label: deriveEditLabel(c.text),
      });
      continue;
    }

    if (op.type === "insert") {
      const p = proposed[op.p]!;
      // Anchor after the nearest preceding current block in the op stream.
      let prevC = -1;
      for (let k = oi - 1; k >= 0; k--) {
        const o = ops[k]!;
        if (o.type === "equal" || o.type === "replace" || o.type === "delete") {
          prevC = o.c;
          break;
        }
        if (o.type === "replaceSpan") {
          prevC = o.cEnd;
          break;
        }
      }
      // A run of inserts after the same current block must chain: without this
      // every one of them splices at `prevC + 1` and they land reversed.
      const prevEdit = edits[edits.length - 1];
      const chainTo =
        prevEdit?.kind === "block" && prevEdit.op === "insert"
          ? edits.length - 1
          : undefined;
      edits.push({
        kind: "block",
        op: "insert",
        anchor: chainTo === undefined && prevC >= 0 ? current[prevC]!.text : "",
        blockIndex: chainTo === undefined ? prevC : -1,
        ...(chainTo === undefined ? {} : { afterEditIndex: chainTo }),
        proposedMarkdown: p.markdown,
        reasoning,
        label: deriveEditLabel(p.markdown),
      });
      continue;
    }

    // replace
    const c = current[op.c]!;
    const p = proposed[op.p]!;
    if (c.guarded) continue; // protected block: leave it untouched

    if (c.kind === "table" && p.kind === "table") {
      let tableIndex = 0;
      for (let i = 0; i < op.c; i++) {
        if (current[i]?.kind === "table") tableIndex++;
      }
      edits.push(...diffTable(c.node, op.c, tableIndex, p.markdown, reasoning));
      continue;
    }

    // A reworded bullet must not replace the whole list.
    if (c.kind === "list" && p.kind === "list") {
      let listIndex = 0;
      for (let i = 0; i < op.c; i++) {
        if (current[i]?.kind === "list") listIndex++;
      }
      const itemEdits = diffList(c.node, listIndex, p.markdown, reasoning);
      if (itemEdits) {
        edits.push(...itemEdits);
        continue;
      }
      // Items added/removed or list type changed → whole-list block replace.
    }

    // Try a minimal anchored word-level edit first (reuses the ai_fix path).
    const bothProse = c.kind === "prose" && p.kind === "prose";
    if (bothProse && wordSimilarity(c.text, p.text) >= WORD_MODE_SIMILARITY) {
      const wordEdit = wordLevelEdit(currentDoc, c.text, c.text, p.text);
      if (wordEdit) {
        edits.push({
          kind: "text",
          anchorText: c.text,
          deleteText: wordEdit.deleteText,
          insertText: wordEdit.insertText,
          reasoning,
          label: deriveEditLabel(p.text),
        });
        continue;
      }
    }

    // Structural / pervasive / un-anchorable change → whole-block render.
    edits.push({
      kind: "block",
      op: "replace",
      anchor: c.text,
      blockIndex: op.c,
      proposedMarkdown: p.markdown,
      reasoning,
      label: deriveEditLabel(p.markdown),
    });
  }

  // A pile of cards is as unreviewable as one giant one: past the cap, collapse
  // to a single whole-field block replace. Never when the field holds a table
  // (the cell diff is granular and worth keeping) or guarded content (a
  // whole-field replace would delete the equation/image the guard protects).
  const canCollapse = !current.some((b) => b.guarded || b.kind === "table");
  if (edits.length > MAX_TARGETED_EDITS && canCollapse) {
    return [
      {
        kind: "block",
        op: "replace",
        anchor: current[0]!.text,
        blockIndex: 0,
        blockCount: current.length,
        proposedMarkdown,
        reasoning,
        label: deriveEditLabel(proposedMarkdown),
      },
    ];
  }

  // Nothing survived (e.g. every change was guarded) → no-op.
  return edits;
}
