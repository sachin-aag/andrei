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
  reasoning: string;
};

export type DiffEdit = TextEdit | BlockEdit;

export type DiffResult =
  | { strategy: "edits"; edits: DiffEdit[] }
  /** Diff was degenerate (near-zero overlap / undroppable) — keep one ai_redraft. */
  | { strategy: "redraft" };

/** Below this token similarity a changed prose block is a rewrite, not a tweak. */
const WORD_MODE_SIMILARITY = 0.4;
/** Below this share of retained blocks the whole field is a rewrite → redraft. */
const REDRAFT_MIN_OVERLAP = 0.2;

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

function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const prev = new Array<number>(n + 1).fill(0);
  const cur = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j]!;
  }
  return prev[n]!;
}

/** Token-level similarity in [0,1] between two block texts. */
function wordSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  const lcs = lcsLength(ta, tb);
  return (2 * lcs) / (ta.length + tb.length || 1);
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

type AlignOp =
  | { type: "equal"; c: number; p: number }
  | { type: "replace"; c: number; p: number }
  | { type: "insert"; p: number }
  | { type: "delete"; c: number };

/** LCS on exact equality, then pair leftover gap items as replace/insert/delete. */
function alignSequences(
  m: number,
  n: number,
  eq: (i: number, j: number) => boolean
): AlignOp[] {
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = eq(i, j)
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: AlignOp[] = [];
  const gapC: number[] = [];
  const gapP: number[] = [];
  const flushGap = () => {
    const k = Math.min(gapC.length, gapP.length);
    for (let t = 0; t < k; t++) ops.push({ type: "replace", c: gapC[t]!, p: gapP[t]! });
    for (let t = k; t < gapC.length; t++) ops.push({ type: "delete", c: gapC[t]! });
    for (let t = k; t < gapP.length; t++) ops.push({ type: "insert", p: gapP[t]! });
    gapC.length = 0;
    gapP.length = 0;
  };

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (eq(i, j)) {
      flushGap();
      ops.push({ type: "equal", c: i, p: j });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      gapC.push(i++);
    } else {
      gapP.push(j++);
    }
  }
  while (i < m) gapC.push(i++);
  while (j < n) gapP.push(j++);
  flushGap();
  return ops;
}

function alignBlocks(current: CurrentBlock[], proposed: ProposedBlock[]): AlignOp[] {
  return alignSequences(
    current.length,
    proposed.length,
    (i, j) => current[i]!.text === proposed[j]!.text
  );
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
    });
    // Chain consecutive inserts: the next row goes after this proposed row
    // once the prior insert has been accepted.
    lastAfterAnchor = rowSignatureFromCells(propRows[op.p]!);
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
): DiffResult {
  const current = extractCurrentBlocks(currentDoc);
  const proposed = extractProposedBlocks(proposedMarkdown);

  const currentHasText = current.some((b) => b.text.length > 0);

  // Empty field → the draft is all-new: one insert per proposed block, in order.
  if (!currentHasText) {
    const edits: DiffEdit[] = proposed.map((p, idx) => ({
      kind: "block" as const,
      op: "insert" as const,
      anchor: "",
      // Each block appends after the previous one; -1 for the first (append to
      // the empty field). Indices count already-inserted proposed blocks.
      blockIndex: idx - 1,
      proposedMarkdown: p.markdown,
      reasoning,
    }));
    return { strategy: "edits", edits };
  }

  const ops = alignBlocks(current, proposed);
  const equalCount = ops.filter((o) => o.type === "equal").length;
  const overlap = current.length > 0 ? equalCount / current.length : 0;
  // Genuine full prose rewrite (shares almost nothing) → keep one whole-field
  // redraft rather than fragmenting into delete-all + insert-all noise. Never
  // redraft when the field holds a table (cell diff is granular and valuable)
  // or guarded content (a whole-field replace would delete the equation/image
  // the guard exists to protect) — fall through to targeted edits instead.
  const anyGuarded = current.some((b) => b.guarded);
  const anyTable = current.some((b) => b.kind === "table");
  if (overlap < REDRAFT_MIN_OVERLAP && !anyGuarded && !anyTable) {
    return { strategy: "redraft" };
  }

  const edits: DiffEdit[] = [];
  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi]!;
    if (op.type === "equal") continue;

    if (op.type === "delete") {
      const c = current[op.c]!;
      if (c.guarded) continue; // never remove protected content via a diff
      edits.push({ kind: "block", op: "delete", anchor: c.text, blockIndex: op.c, reasoning });
      continue;
    }

    if (op.type === "insert") {
      const p = proposed[op.p]!;
      // Anchor after the nearest preceding equal current block.
      let prevC = -1;
      for (let k = oi - 1; k >= 0; k--) {
        const o = ops[k]!;
        if (o.type === "equal" || o.type === "replace" || o.type === "delete") {
          prevC = o.c;
          break;
        }
      }
      edits.push({
        kind: "block",
        op: "insert",
        anchor: prevC >= 0 ? current[prevC]!.text : "",
        blockIndex: prevC,
        proposedMarkdown: p.markdown,
        reasoning,
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
    });
  }

  if (edits.length === 0) {
    // Nothing survived (e.g. every change was guarded) — no-op, no redraft.
    return { strategy: "edits", edits: [] };
  }
  return { strategy: "edits", edits };
}
