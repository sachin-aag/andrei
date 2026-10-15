/**
 * Tracked-change persistence for whole-field results (merge or redraft) on
 * documents that keep accepted revisions (`suggestionApplyMode: "tracked_change"`).
 *
 * Wrapping the entire current field as deleted and the entire result as inserted
 * turns a one-cell edit into a full-document revision, and every later apply
 * re-wraps the previous one, so dead copies pile up. Instead, diff the visible
 * text block by block: unchanged blocks keep their existing history, only
 * changed blocks / rows / cells are marked, and blocks that are already fully
 * deleted are carried through once instead of being deleted again.
 */
import type { JSONContent } from "@tiptap/core";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";
import { isMathAtomNode } from "@/lib/tiptap/math-anchor";
import { isTableRefNode } from "@/lib/tiptap/table-ref-markdown";
import type { RedraftPreviewAttrs } from "@/lib/tiptap/redraft-preview";

type Mark = NonNullable<JSONContent["marks"]>[number];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const isTracked = (m: Mark, name: string) =>
  m.type === name && (m.attrs as { status?: string } | undefined)?.status === "accepted";

function isInlineLeaf(n: JSONContent): boolean {
  return n.type === "text" || isTableRefNode(n) || isMathAtomNode(n);
}

/** What a reader sees: committed deletions dropped, committed insertions plain. */
export function visibleTrackedContent(node: JSONContent): JSONContent {
  const out = clone(node);
  const walk = (n: JSONContent) => {
    if (!n.content) return;
    n.content = n.content.filter(
      (ch) => !(isInlineLeaf(ch) && (ch.marks ?? []).some((m) => isTracked(m, suggestionDeleteMarkName)))
    );
    for (const ch of n.content) {
      if (ch.marks) {
        ch.marks = ch.marks.filter((m) => !isTracked(m, suggestionInsertMarkName));
        if (ch.marks.length === 0) delete ch.marks;
      }
      walk(ch);
    }
  };
  walk(out);
  return out;
}

function hasInline(n: JSONContent): boolean {
  if (isInlineLeaf(n)) return n.type !== "text" || (n.text ?? "").length > 0;
  return (n.content ?? []).some(hasInline);
}

/** Block whose every inline leaf is a committed deletion — history only. */
function isGhost(n: JSONContent): boolean {
  return hasInline(n) && !hasInline(visibleTrackedContent(n));
}

const keyOf = (n: JSONContent) => JSON.stringify(visibleTrackedContent(n));

function markLeaves(node: JSONContent, name: string, attrs: RedraftPreviewAttrs): JSONContent {
  const out = clone(node);
  const walk = (n: JSONContent) => {
    if (isInlineLeaf(n)) {
      const marks = n.marks ?? [];
      // Text already deleted stays deleted once; never stack a second revision on it.
      if (name === suggestionDeleteMarkName && marks.some((m) => isTracked(m, suggestionDeleteMarkName))) return;
      n.marks = [...marks, { type: name, attrs: { ...attrs } }];
      return;
    }
    n.content?.forEach(walk);
  };
  walk(out);
  return out;
}

/** Longest-common-subsequence alignment over block keys. */
function align(a: string[], b: string[]): Array<["same", number, number] | ["del", number] | ["ins", number]> {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Array<["same", number, number] | ["del", number] | ["ins", number]> = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push(["same", i++, j++]); continue; }
    // Deletion before insertion on ties, as Word shows a replacement.
    if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) ops.push(["del", i++]);
    else ops.push(["ins", j++]);
  }
  return ops;
}

/** Plain text of a textblock whose children are all unmarked text, else null. */
function plainRunText(n: JSONContent): string | null {
  let text = "";
  for (const ch of n.content ?? []) {
    if (ch.type !== "text" || (ch.marks ?? []).length > 0) return null;
    text += ch.text ?? "";
  }
  return text;
}

/**
 * Word-level revision for unformatted text, so "this equipment" → "HB-02"
 * records two words instead of the whole sentence. Null when either side
 * carries formatting, atoms, or earlier revisions (block-level fallback).
 */
function wordDiff(oldN: JSONContent, newN: JSONContent, attrs: RedraftPreviewAttrs): JSONContent[] | null {
  const a = plainRunText(oldN), b = plainRunText(newN);
  if (a === null || b === null) return null;
  const ta = a.split(/(\s+)/).filter(Boolean), tb = b.split(/(\s+)/).filter(Boolean);
  if (ta.length * tb.length > 250_000) return null;
  const runs: JSONContent[] = [];
  const push = (text: string, mark: string | null) => {
    const last = runs.at(-1);
    const lastMark = last?.marks?.[0]?.type ?? null;
    if (last && lastMark === mark) { last.text += text; return; }
    runs.push(mark ? { type: "text", text, marks: [{ type: mark, attrs: { ...attrs } }] } : { type: "text", text });
  };
  for (const op of align(ta, tb)) {
    if (op[0] === "same") push(ta[op[1]], null);
    else if (op[0] === "del") push(ta[op[1]], suggestionDeleteMarkName);
    else push(tb[op[1]], suggestionInsertMarkName);
  }
  return runs;
}

/**
 * Same-shaped replacement (paragraph → paragraph, cell → cell): keep one node,
 * old inline content deleted then new inline content inserted.
 */
function replaceInline(oldN: JSONContent, newN: JSONContent, attrs: RedraftPreviewAttrs): JSONContent {
  const words = wordDiff(oldN, newN, attrs);
  if (words) return { ...clone(newN), content: words };
  const del = markLeaves(oldN, suggestionDeleteMarkName, attrs).content ?? [];
  const ins = markLeaves(newN, suggestionInsertMarkName, attrs).content ?? [];
  return { ...clone(newN), content: [...del, ...ins] };
}

function diffCell(oldC: JSONContent, newC: JSONContent, attrs: RedraftPreviewAttrs): JSONContent {
  if (keyOf(oldC) === keyOf(newC)) return clone(oldC);
  const oldParas = oldC.content ?? [];
  const newParas = newC.content ?? [];
  if (oldParas.length === 1 && newParas.length === 1 && oldParas[0].type === newParas[0].type) {
    return { ...clone(newC), content: [replaceInline(oldParas[0], newParas[0], attrs)] };
  }
  return { ...clone(newC), content: diffBlocks(oldParas, newParas, attrs) };
}

function diffRow(oldR: JSONContent, newR: JSONContent, attrs: RedraftPreviewAttrs): JSONContent {
  const oc = oldR.content ?? [], nc = newR.content ?? [];
  if (oc.length !== nc.length) return markLeaves(newR, suggestionInsertMarkName, attrs);
  return { ...clone(newR), content: nc.map((c, i) => diffCell(oc[i], c, attrs)) };
}

function diffTable(oldT: JSONContent, newT: JSONContent, attrs: RedraftPreviewAttrs): JSONContent {
  const oldRows = oldT.content ?? [], newRows = newT.content ?? [];
  const ops = align(oldRows.map(keyOf), newRows.map(keyOf));
  const rows: JSONContent[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op[0] === "same") { rows.push(clone(oldRows[op[1]])); continue; }
    // Pair a deleted row with the inserted row that replaces it (edited cells).
    const next = ops[k + 1];
    if (op[0] === "del" && next?.[0] === "ins") {
      rows.push(diffRow(oldRows[op[1]], newRows[next[1]], attrs));
      k++;
      continue;
    }
    if (op[0] === "ins" && next?.[0] === "del") {
      rows.push(diffRow(oldRows[next[1]], newRows[op[1]], attrs));
      k++;
      continue;
    }
    rows.push(op[0] === "del"
      ? markLeaves(oldRows[op[1]], suggestionDeleteMarkName, attrs)
      : markLeaves(newRows[op[1]], suggestionInsertMarkName, attrs));
  }
  return { ...clone(newT), content: rows };
}

function replaceBlock(oldB: JSONContent, newB: JSONContent, attrs: RedraftPreviewAttrs): JSONContent[] {
  if (oldB.type === "table" && newB.type === "table") return [diffTable(oldB, newB, attrs)];
  const textblock = (t?: string) => t === "paragraph" || t === "heading";
  if (oldB.type === newB.type && textblock(oldB.type)) return [replaceInline(oldB, newB, attrs)];
  return [markLeaves(oldB, suggestionDeleteMarkName, attrs), markLeaves(newB, suggestionInsertMarkName, attrs)];
}

function diffBlocks(current: JSONContent[], next: JSONContent[], attrs: RedraftPreviewAttrs): JSONContent[] {
  // Fully-deleted history blocks are carried through in place, never re-diffed.
  const live = current.map((b, i) => ({ b, i })).filter(({ b }) => !isGhost(b));
  const target = next.filter((b) => !isGhost(b));
  const ghostsBefore = new Map<number, JSONContent[]>();
  let pending: JSONContent[] = [];
  let liveIdx = 0;
  for (const b of current) {
    if (isGhost(b)) { pending.push(clone(b)); continue; }
    ghostsBefore.set(liveIdx++, pending);
    pending = [];
  }
  const trailingGhosts = pending;

  const ops = align(live.map(({ b }) => keyOf(b)), target.map(keyOf));
  const out: JSONContent[] = [];
  const emitGhosts = (li: number) => { out.push(...(ghostsBefore.get(li) ?? [])); ghostsBefore.delete(li); };
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op[0] === "same") { emitGhosts(op[1]); out.push(clone(live[op[1]].b)); continue; }
    const next = ops[k + 1];
    if (op[0] === "del" && next?.[0] === "ins") {
      emitGhosts(op[1]);
      out.push(...replaceBlock(live[op[1]].b, target[next[1]], attrs));
      k++;
      continue;
    }
    if (op[0] === "del") { emitGhosts(op[1]); out.push(markLeaves(live[op[1]].b, suggestionDeleteMarkName, attrs)); continue; }
    out.push(markLeaves(target[op[1]], suggestionInsertMarkName, attrs));
  }
  for (const rest of ghostsBefore.values()) out.push(...rest);
  out.push(...trailingGhosts);
  return out;
}

/**
 * `current` with the change to `next` recorded as revision marks carrying
 * `attrs` (callers commit them by id). Unchanged content is left untouched.
 */
export function trackedChangeDoc(
  current: JSONContent,
  next: JSONContent,
  attrs: RedraftPreviewAttrs
): JSONContent {
  return {
    ...clone(current),
    type: "doc",
    content: diffBlocks(current.content ?? [], next.content ?? [], attrs),
  };
}
