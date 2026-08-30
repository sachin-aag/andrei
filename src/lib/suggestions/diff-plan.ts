/**
 * Pure, isomorphic planner: given old and new field content, emit the
 * minimal operation set. No DB, no server-only modules, no network.
 *
 * Coverage classifies (edit vs rewrite); it never rejects. The denominator
 * is per block and weights each inline atom (image / equation) as
 * {@link INLINE_ATOM_WEIGHT} characters so an image-heavy block is not a
 * near-zero denominator.
 */
import type { JSONContent } from "@tiptap/core";
import { diffWords } from "diff";
import { stripPendingSuggestionsExcept } from "@/lib/tiptap/suggestion-inject";
import {
  stripTrailingCitationBlockFromDoc,
  stripTrailingCitationBlockFromText,
} from "@/lib/suggestions/citations-at-end";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";

export const INLINE_ATOM_WEIGHT = 20;
export const COALESCING_GAP = 20;
export const REWRITE_COVERAGE_THRESHOLD = 0.5;

const INLINE_ATOM_TYPES = new Set(["imageInline", "mathInline", "mathBlock"]);
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "codeBlock",
  "blockquote",
  "bulletList",
  "orderedList",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "listItem",
]);

export type FieldContent = JSONContent | string;

export type PlannedOperationKind =
  | "replace_block"
  | "insert_block"
  | "remove_block";

export type OperationClassification = "edit" | "rewrite";

export type PlannedOperation = {
  opIndex: number;
  blockId: string;
  kind: PlannedOperationKind;
  classification: OperationClassification;
  coverage: number;
  deleteText: string;
  insertText: string;
  next?: FieldContent;
};

export type MergeBlockKind =
  | "prose"
  | "list_item"
  | "table_cell"
  | "plain_line"
  | "other";

export type MergeBlock = {
  id: string;
  kind: MergeBlockKind;
  text: string;
  weight: number;
  atoms: number;
  atomKey: string;
  node: FieldContent;
  /** Index in the extracted block list (alignment key when kinds match). */
  index: number;
};

export type PlanOptions = {
  /** When true (default), drop a trailing Citations: block before diffing. */
  excludeCitations?: boolean;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function atomKeyOf(node: JSONContent): string {
  const keys: string[] = [];
  const walk = (n: JSONContent) => {
    const type = n.type ?? "";
    if (type === "imageInline") {
      keys.push(`img:${String((n.attrs as { src?: string } | undefined)?.src ?? "")}`);
      return;
    }
    if (type === "mathInline" || type === "mathBlock") {
      keys.push(`math:${String((n.attrs as { latex?: string } | undefined)?.latex ?? "")}`);
      return;
    }
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return keys.join("|");
}

function atomCount(node: JSONContent): number {
  let count = 0;
  const walk = (n: JSONContent) => {
    if (INLINE_ATOM_TYPES.has(n.type ?? "")) {
      count += 1;
      return;
    }
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return count;
}

function textOf(node: JSONContent): string {
  const parts: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === "text") {
      parts.push(n.text ?? "");
      return;
    }
    if (n.type === "hardBreak") {
      parts.push("\n");
      return;
    }
    if (INLINE_ATOM_TYPES.has(n.type ?? "")) {
      return;
    }
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return parts.join("");
}

function blockWeight(text: string, atoms: number): number {
  const chars = collapseWhitespace(text).length;
  return chars + atoms * INLINE_ATOM_WEIGHT;
}

/**
 * Strip pending suggestion marks (keep accepted / human track-changes) and
 * drop a generated trailing Citations block so it is not part of the diff.
 */
export function normalizeFieldForPlan(
  field: FieldContent,
  options?: PlanOptions
): FieldContent {
  const excludeCitations = options?.excludeCitations !== false;
  if (typeof field === "string") {
    return excludeCitations ? stripTrailingCitationBlockFromText(field) : field;
  }
  let doc = stripPendingSuggestionsExcept(cloneJson(field), null);
  if (excludeCitations) {
    doc = stripTrailingCitationBlockFromDoc(doc);
  }
  return doc;
}

function collectRichBlocks(doc: JSONContent): MergeBlock[] {
  const blocks: MergeBlock[] = [];

  const push = (node: JSONContent, id: string, kind: MergeBlockKind) => {
    const text = textOf(node);
    const atoms = atomCount(node);
    blocks.push({
      id,
      kind,
      text,
      atoms,
      atomKey: atomKeyOf(node),
      weight: blockWeight(text, atoms),
      node: cloneJson(node),
      index: blocks.length,
    });
  };

  const walk = (node: JSONContent, id: string) => {
    const type = node.type ?? "";
    if (type === "table") {
      const rows = node.content ?? [];
      rows.forEach((row, ri) => {
        (row.content ?? []).forEach((cell, ci) => {
          push(cell, `${id}/r${ri}c${ci}`, "table_cell");
        });
      });
      return;
    }
    if (type === "bulletList" || type === "orderedList") {
      (node.content ?? []).forEach((item, i) => {
        walk(item, `${id}/i${i}`);
      });
      return;
    }
    if (type === "listItem") {
      const children = node.content ?? [];
      const hasNestedList = children.some(
        (child) => child.type === "bulletList" || child.type === "orderedList"
      );
      if (hasNestedList) {
        children.forEach((child, i) => walk(child, `${id}/n${i}`));
        return;
      }
      push(node, id, "list_item");
      return;
    }
    if (
      type === "paragraph" ||
      type === "heading" ||
      type === "codeBlock" ||
      type === "blockquote"
    ) {
      push(node, id, "prose");
      return;
    }
    if (BLOCK_TYPES.has(type) || type === "doc") {
      (node.content ?? []).forEach((child, i) => walk(child, `${id}.${i}`));
    }
  };

  walk(doc, "d");
  return blocks;
}

function collectPlainBlocks(text: string): MergeBlock[] {
  const lines = text.split("\n");
  return lines.map((line, index) => ({
    id: `p${index}`,
    kind: "plain_line" as const,
    text: line,
    atoms: 0,
    atomKey: "",
    weight: blockWeight(line, 0),
    node: line,
    index,
  }));
}

export function extractMergeBlocks(
  field: FieldContent,
  options?: PlanOptions
): MergeBlock[] {
  const normalized = normalizeFieldForPlan(field, options);
  if (typeof normalized === "string") return collectPlainBlocks(normalized);
  return collectRichBlocks(normalized);
}

function similarBlocks(a: MergeBlock, b: MergeBlock): boolean {
  if (a.kind !== b.kind) return false;
  if (a.atomKey && a.atomKey === b.atomKey) return true;
  if (a.text === b.text && a.atoms === b.atoms) return true;
  const ta = collapseWhitespace(a.text);
  const tb = collapseWhitespace(b.text);
  if (ta.length === 0 && tb.length === 0) return a.atoms === b.atoms;
  if (a.index === b.index) return true;
  if (ta.length === 0 || tb.length === 0) return false;
  const shorter = Math.min(ta.length, tb.length);
  const longer = Math.max(ta.length, tb.length);
  if (shorter / longer < 0.3) return false;
  return (
    ta.slice(0, 24) === tb.slice(0, 24) ||
    ta.includes(tb.slice(0, 16)) ||
    tb.includes(ta.slice(0, 16))
  );
}

type AlignHunk =
  | { type: "equal"; left: MergeBlock; right: MergeBlock }
  | { type: "replace"; left: MergeBlock; right: MergeBlock }
  | { type: "insert"; right: MergeBlock }
  | { type: "remove"; left: MergeBlock };

function alignBlocks(left: MergeBlock[], right: MergeBlock[]): AlignHunk[] {
  const usedRight = new Set<number>();
  const usedLeft = new Set<number>();
  const pairs: Array<{ li: number; ri: number; exact: boolean }> = [];

  for (let li = 0; li < left.length; li++) {
    const l = left[li]!;
    let exact = -1;
    for (let ri = 0; ri < right.length; ri++) {
      if (usedRight.has(ri)) continue;
      const r = right[ri]!;
      if (l.kind === r.kind && l.text === r.text && JSON.stringify(l.node) === JSON.stringify(r.node)) {
        exact = ri;
        break;
      }
    }
    if (exact >= 0) {
      usedLeft.add(li);
      usedRight.add(exact);
      pairs.push({ li, ri: exact, exact: true });
    }
  }

  for (let li = 0; li < left.length; li++) {
    if (usedLeft.has(li)) continue;
    const l = left[li]!;
    let best = -1;
    for (let ri = 0; ri < right.length; ri++) {
      if (usedRight.has(ri)) continue;
      if (similarBlocks(l, right[ri]!)) {
        best = ri;
        break;
      }
    }
    if (best >= 0) {
      usedLeft.add(li);
      usedRight.add(best);
      pairs.push({ li, ri: best, exact: false });
    }
  }

  pairs.sort((a, b) => a.li - b.li);
  const hunks: AlignHunk[] = [];
  let li = 0;
  let ri = 0;
  const pairByLeft = new Map(pairs.map((p) => [p.li, p]));

  while (li < left.length || ri < right.length) {
    const pair = pairByLeft.get(li);
    if (pair && pair.ri === ri) {
      const l = left[li]!;
      const r = right[ri]!;
      if (pair.exact) hunks.push({ type: "equal", left: l, right: r });
      else hunks.push({ type: "replace", left: l, right: r });
      li += 1;
      ri += 1;
      continue;
    }
    if (pair && pair.ri > ri) {
      hunks.push({ type: "insert", right: right[ri]! });
      ri += 1;
      continue;
    }
    if (li < left.length && !pairByLeft.has(li)) {
      hunks.push({ type: "remove", left: left[li]! });
      li += 1;
      continue;
    }
    if (ri < right.length && ![...pairs].some((p) => p.ri === ri)) {
      hunks.push({ type: "insert", right: right[ri]! });
      ri += 1;
      continue;
    }
    if (pair) {
      while (ri < pair.ri) {
        hunks.push({ type: "insert", right: right[ri]! });
        ri += 1;
      }
      continue;
    }
    if (ri < right.length) {
      hunks.push({ type: "insert", right: right[ri]! });
      ri += 1;
      continue;
    }
    if (li < left.length) {
      hunks.push({ type: "remove", left: left[li]! });
      li += 1;
    }
  }
  return hunks;
}

/**
 * Word-diff hunks whose unchanged gap is shorter than {@link COALESCING_GAP}
 * become one hunk. The bridge text is copied into both delete and insert so
 * locate still matches a unique span.
 */
export function coalesceWordDiff(
  fromText: string,
  toText: string
): Array<{ deleteText: string; insertText: string }> {
  if (fromText === toText) return [];
  const parts = diffWords(fromText, toText);
  const hunks: Array<{ deleteText: string; insertText: string; gap: string }> = [];
  let pendingDelete = "";
  let pendingInsert = "";
  let pendingGap = "";

  const flush = () => {
    if (!pendingDelete && !pendingInsert) {
      pendingGap = "";
      return;
    }
    hunks.push({
      deleteText: pendingDelete,
      insertText: pendingInsert,
      gap: pendingGap,
    });
    pendingDelete = "";
    pendingInsert = "";
    pendingGap = "";
  };

  for (const part of parts) {
    if (part.added) {
      pendingInsert += part.value;
      continue;
    }
    if (part.removed) {
      pendingDelete += part.value;
      continue;
    }
    const equal = part.value;
    if (!pendingDelete && !pendingInsert) continue;
    if (equal.length < COALESCING_GAP) {
      pendingDelete += equal;
      pendingInsert += equal;
      continue;
    }
    flush();
  }
  flush();
  return hunks.map(({ deleteText, insertText }) => ({ deleteText, insertText }));
}

function classifyCoverage(deleteText: string, block: MergeBlock): {
  coverage: number;
  classification: OperationClassification;
} {
  const deleted = collapseWhitespace(deleteText).length;
  const denom = Math.max(block.weight, 1);
  const coverage = Math.min(1, deleted / denom);
  return {
    coverage,
    classification: coverage > REWRITE_COVERAGE_THRESHOLD ? "rewrite" : "edit",
  };
}

/**
 * Diff `base` → `target` into operations. `planFieldDiff(x, x)` is always `[]`.
 */
export function planFieldDiff(
  base: FieldContent,
  target: FieldContent,
  options?: PlanOptions
): PlannedOperation[] {
  const left = extractMergeBlocks(base, options);
  const right = extractMergeBlocks(target, options);
  const hunks = alignBlocks(left, right);
  const ops: PlannedOperation[] = [];

  const push = (op: Omit<PlannedOperation, "opIndex">) => {
    ops.push({ ...op, opIndex: ops.length });
  };

  for (const hunk of hunks) {
    switch (hunk.type) {
      case "equal":
        break;
      case "replace": {
        const wordHunks = coalesceWordDiff(hunk.left.text, hunk.right.text);
        if (
          wordHunks.length === 0 &&
          JSON.stringify(hunk.left.node) === JSON.stringify(hunk.right.node)
        ) {
          break;
        }
        const deleteText =
          wordHunks.length > 0
            ? wordHunks.map((h) => h.deleteText).join("")
            : hunk.left.text;
        const insertText =
          wordHunks.length > 0
            ? wordHunks.map((h) => h.insertText).join("")
            : hunk.right.text;
        const { coverage, classification } = classifyCoverage(deleteText, hunk.left);
        push({
          blockId: hunk.left.id,
          kind: "replace_block",
          classification,
          coverage,
          deleteText,
          insertText,
          next: hunk.right.node,
        });
        break;
      }
      case "insert": {
        const { coverage, classification } = classifyCoverage("", {
          ...hunk.right,
          weight: Math.max(hunk.right.weight, 1),
        });
        push({
          blockId: hunk.right.id,
          kind: "insert_block",
          classification: hunk.right.weight > 0 ? "rewrite" : classification,
          coverage,
          deleteText: "",
          insertText: hunk.right.text,
          next: hunk.right.node,
        });
        break;
      }
      case "remove": {
        const { coverage, classification } = classifyCoverage(hunk.left.text, hunk.left);
        push({
          blockId: hunk.left.id,
          kind: "remove_block",
          classification,
          coverage,
          deleteText: hunk.left.text,
          insertText: "",
        });
        break;
      }
      default: {
        const _never: never = hunk;
        throw new Error(`unhandled align hunk: ${JSON.stringify(_never)}`);
      }
    }
  }
  return ops;
}

/** Derived whole-field: every extracted block is touched by an operation. */
export function operationsCoverWholeField(
  operations: readonly PlannedOperation[],
  blocks: readonly MergeBlock[]
): boolean {
  if (blocks.length === 0) return operations.length === 0;
  const touched = new Set(operations.map((op) => op.blockId));
  return blocks.every((block) => touched.has(block.id));
}

function setDocChild(doc: JSONContent, id: string, next: JSONContent): JSONContent {
  const cloned = cloneJson(doc);
  const blocks = collectRichBlocks(cloned);
  const match = blocks.find((b) => b.id === id);
  if (!match) return cloned;
  replaceNodeByIdentity(cloned, match.node as JSONContent, next);
  return cloned;
}

function replaceNodeByIdentity(
  root: JSONContent,
  target: JSONContent,
  next: JSONContent
): boolean {
  if (root === target) return false;
  const content = root.content;
  if (!content) return false;
  for (let i = 0; i < content.length; i++) {
    const child = content[i]!;
    if (JSON.stringify(child) === JSON.stringify(target)) {
      content[i] = cloneJson(next);
      return true;
    }
    if (replaceNodeByIdentity(child, target, next)) return true;
  }
  return false;
}

function removeNodeByIdentity(root: JSONContent, target: JSONContent): boolean {
  const content = root.content;
  if (!content) return false;
  const idx = content.findIndex((child) => JSON.stringify(child) === JSON.stringify(target));
  if (idx >= 0) {
    content.splice(idx, 1);
    return true;
  }
  return content.some((child) => removeNodeByIdentity(child, target));
}

function insertNodeNear(root: JSONContent, afterId: string | null, next: JSONContent, blocks: MergeBlock[]): JSONContent {
  const cloned = cloneJson(root);
  if (!afterId) {
    cloned.content = [cloneJson(next), ...(cloned.content ?? [])];
    return cloned;
  }
  const after = blocks.find((b) => b.id === afterId);
  if (!after || typeof after.node === "string") {
    cloned.content = [...(cloned.content ?? []), cloneJson(next)];
    return cloned;
  }
  insertAfterIdentity(cloned, after.node as JSONContent, next);
  return cloned;
}

function insertAfterIdentity(root: JSONContent, target: JSONContent, next: JSONContent): boolean {
  const content = root.content;
  if (!content) return false;
  const idx = content.findIndex((child) => JSON.stringify(child) === JSON.stringify(target));
  if (idx >= 0) {
    content.splice(idx + 1, 0, cloneJson(next));
    return true;
  }
  return content.some((child) => insertAfterIdentity(child, target, next));
}

/**
 * Apply a plan to `base`. Used by the Step 0 invariant
 * `apply(plan(old, new), old) == new` (after normalize).
 */
export function applyFieldPlan(
  base: FieldContent,
  operations: readonly PlannedOperation[],
  options?: PlanOptions
): FieldContent {
  const normalized = normalizeFieldForPlan(base, options);
  if (operations.length === 0) return normalized;

  if (typeof normalized === "string") {
    const lines = normalized.split("\n");
    const nextLines = [...lines];
    for (const op of operations) {
      const index = Number(op.blockId.slice(1));
      switch (op.kind) {
        case "replace_block":
          if (typeof op.next === "string") nextLines[index] = op.next;
          break;
        case "insert_block":
          if (typeof op.next === "string") {
            nextLines.splice(index, 0, op.next);
          }
          break;
        case "remove_block":
          if (index >= 0 && index < nextLines.length) nextLines.splice(index, 1);
          break;
        default: {
          const _never: never = op.kind;
          throw new Error(`unhandled op kind: ${_never}`);
        }
      }
    }
    return nextLines.join("\n");
  }

  let doc = cloneJson(normalized);
  let snapshot = collectRichBlocks(doc);
  for (const op of operations) {
    switch (op.kind) {
      case "replace_block":
        if (op.next && typeof op.next !== "string") {
          doc = setDocChild(doc, op.blockId, op.next);
          snapshot = collectRichBlocks(doc);
        }
        break;
      case "insert_block":
        if (op.next && typeof op.next !== "string") {
          doc = insertNodeNear(doc, snapshot.at(-1)?.id ?? null, op.next, snapshot);
          snapshot = collectRichBlocks(doc);
        }
        break;
      case "remove_block": {
        const match = snapshot.find((b) => b.id === op.blockId);
        if (match && typeof match.node !== "string") {
          const cloned = cloneJson(doc);
          removeNodeByIdentity(cloned, match.node as JSONContent);
          doc = cloned;
          snapshot = collectRichBlocks(doc);
        }
        break;
      }
      default: {
        const _never: never = op.kind;
        throw new Error(`unhandled op kind: ${_never}`);
      }
    }
  }
  return doc;
}

export function canonicalField(field: FieldContent, options?: PlanOptions): string {
  const blocks = extractMergeBlocks(field, options);
  return blocks
    .map((b) => `${b.kind}:${collapseWhitespace(b.text)}:${b.atoms}`)
    .join("\n");
}
