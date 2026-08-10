import type { JSONContent } from "@tiptap/core";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import type { InjectAttrs } from "@/lib/suggestions/locator";
import {
  suggestionDeleteMarkName,
  suggestionInsertMarkName,
} from "@/lib/tiptap/suggestion-marks";

/** Below this token similarity a changed span is a rewrite, not a tweak. */
export const WORD_DIFF_MIN_SIMILARITY = 0.4;

export function tokenize(text: string): string[] {
  const n = collapseWhitespace(text).trim();
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

/** Token-level Dice similarity in [0,1] via LCS. */
export function wordSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  const lcs = lcsLength(ta, tb);
  return (2 * lcs) / (ta.length + tb.length || 1);
}

export type AlignOp =
  | { type: "equal"; c: number; p: number }
  | { type: "replace"; c: number; p: number }
  | { type: "insert"; p: number }
  | { type: "delete"; c: number };

/** LCS on exact equality, then pair leftover gap items as replace/insert/delete. */
export function alignSequences(
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

function pushText(
  nodes: JSONContent[],
  text: string,
  markName?: string,
  attrs?: InjectAttrs
): void {
  if (!text) return;
  const node: JSONContent = { type: "text", text };
  if (markName && attrs) {
    node.marks = [{ type: markName, attrs: { ...attrs } }];
  }
  nodes.push(node);
}

/**
 * One paragraph whose text is a unified word diff: unchanged tokens once,
 * deletions struck, insertions highlighted. Used for high-overlap block
 * replace previews so the engineer sees what actually changed instead of
 * the whole old field struck + the whole new field duplicated in green.
 */
export function buildWordDiffParagraph(
  oldText: string,
  newText: string,
  attrs: InjectAttrs
): JSONContent {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const ops = alignSequences(a.length, b.length, (i, j) => a[i] === b[j]);
  const content: JSONContent[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k]!;
    const space = k > 0 ? " " : "";
    if (op.type === "equal") {
      pushText(content, `${space}${a[op.c]!}`);
    } else if (op.type === "delete") {
      pushText(content, `${space}${a[op.c]!}`, suggestionDeleteMarkName, attrs);
    } else if (op.type === "insert") {
      pushText(content, `${space}${b[op.p]!}`, suggestionInsertMarkName, attrs);
    } else {
      pushText(content, `${space}${a[op.c]!}`, suggestionDeleteMarkName, attrs);
      pushText(content, ` ${b[op.p]!}`, suggestionInsertMarkName, attrs);
    }
  }
  return { type: "paragraph", content: content.length > 0 ? content : [] };
}
