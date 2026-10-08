/**
 * Pure, isomorphic three-way merge of a field. Supersession is a pre-pass
 * elsewhere — it is not a merge outcome.
 *
 * Given base (what the model saw), current (live field), and intent (what
 * the model wants), reconcile positionally: blocks, then table rows/cells,
 * then words inside a paragraph. Conflicts stay scoped to the overlapping
 * region; they never reject the rest of the suggestion.
 */
import type { JSONContent } from "@tiptap/core";
import {
  canonicalField,
  normalizeFieldForPlan,
  planFieldDiff,
  type FieldContent,
  type PlanOptions,
  type PlannedOperation,
} from "@/lib/suggestions/diff-plan";
import {
  appendCitationListToDoc,
  citationListEntriesFromDoc,
  citationMarkerNumbersFromDoc,
  moveCitationsToEndOfText,
  normalizeTrailingCitationBlockInDoc,
  remapNumericCitationMarkersInDoc,
  dropTrailingCitationListFromDoc,
} from "@/lib/suggestions/citations-at-end";
import { plainTextFromTiptapJson } from "@/lib/section-content-normalize";

export type MergeConflict = {
  blockId: string;
  baseText: string;
  currentText: string;
  intentText: string;
};

export type ThreeWayMergeResult =
  | {
      status: "noop";
      operations: [];
      merged: FieldContent;
    }
  | {
      status: "clean";
      operations: PlannedOperation[];
      merged: FieldContent;
    }
  | {
      status: "conflict";
      operations: PlannedOperation[];
      merged: FieldContent;
      conflicts: MergeConflict[];
    };

function parkCitations(field: FieldContent): FieldContent {
  if (typeof field === "string") return moveCitationsToEndOfText(field);
  return normalizeTrailingCitationBlockInDoc(field);
}

/**
 * Index pairs of a longest common subsequence. The shared prefix and suffix
 * are trimmed first so a local edit in a long field stays cheap.
 */
function lcsPairs(a: readonly string[], b: readonly string[]): Map<number, number> {
  const pairs = new Map<number, number>();
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    pairs.set(start, start);
    start += 1;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const n = endA - start;
  const m = endB - start;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[start + i] === b[start + j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[start + i] === b[start + j]) {
      pairs.set(start + i, start + j);
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  for (let k = 0; endA + k < a.length; k++) pairs.set(endA + k, endB + k);
  return pairs;
}

type Diff3Region<T> =
  | { stable: true; base: T; current: T; intent: T }
  | { stable: false; at: number; base: T[]; current: T[]; intent: T[] };

/**
 * diff3 over ordered items: an item unchanged on both sides is stable;
 * everything between two stable items is one region per side.
 */
function diff3Regions<T>(
  base: readonly T[],
  current: readonly T[],
  intent: readonly T[],
  key: (item: T) => string
): Diff3Region<T>[] {
  const baseKeys = base.map(key);
  const toCurrent = lcsPairs(baseKeys, current.map(key));
  const toIntent = lcsPairs(baseKeys, intent.map(key));
  const regions: Diff3Region<T>[] = [];
  let i = 0;
  let a = 0;
  let b = 0;
  while (i < base.length || a < current.length || b < intent.length) {
    if (i < base.length && toCurrent.get(i) === a && toIntent.get(i) === b) {
      regions.push({ stable: true, base: base[i]!, current: current[a]!, intent: intent[b]! });
      i += 1;
      a += 1;
      b += 1;
      continue;
    }
    let k = i;
    while (k < base.length && !(toCurrent.has(k) && toIntent.has(k))) k += 1;
    const aEnd = k < base.length ? toCurrent.get(k)! : current.length;
    const bEnd = k < base.length ? toIntent.get(k)! : intent.length;
    regions.push({
      stable: false,
      at: i,
      base: base.slice(i, k),
      current: current.slice(a, aEnd),
      intent: intent.slice(b, bEnd),
    });
    i = k;
    a = aEnd;
    b = bEnd;
  }
  return regions;
}

type InlineToken = { key: string; node: JSONContent };

const WORD_TOKEN_RE = /\n|[^\S\n]+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

function wordTokens(text: string): string[] {
  return text.match(WORD_TOKEN_RE) ?? [];
}

function inlineTokens(node: JSONContent): InlineToken[] {
  return (node.content ?? []).flatMap((child) =>
    child.type === "text"
      ? wordTokens(child.text ?? "").map((text) => ({ key: text, node: { ...child, text } }))
      : [{ key: `\u0000${child.type}:${JSON.stringify(child.attrs ?? {})}`, node: child }]
  );
}

function textTokens(text: string): InlineToken[] {
  return wordTokens(text).map((key) => ({ key, node: { type: "text", text: key } }));
}

function marksKey(node: JSONContent): string {
  return JSON.stringify(node.marks ?? []);
}

function tokensText(tokens: readonly InlineToken[]): string {
  return tokens.map((t) => t.node.text ?? "").join("");
}

function sameKeys(a: readonly InlineToken[], b: readonly InlineToken[]): boolean {
  return a.length === b.length && a.every((t, i) => t.key === b[i]!.key);
}

function joinInline(nodes: readonly JSONContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === "text" && last?.type === "text" && marksKey(last) === marksKey(node)) {
      out[out.length - 1] = { ...last, text: `${last.text ?? ""}${node.text ?? ""}` };
    } else {
      out.push(node);
    }
  }
  return out;
}

/**
 * Word-level diff3 inside one paragraph (or a plain-text field). Unchanged
 * words keep the live marks unless only the model restyled them; inline
 * atoms (table refs, math, images) are single tokens. An overlapping edit
 * keeps the live words for that region only.
 */
function mergeInline(
  base: readonly InlineToken[],
  current: readonly InlineToken[],
  intent: readonly InlineToken[],
  conflicts: MergeConflict[],
  label: string
): JSONContent[] {
  const out: JSONContent[] = [];
  for (const region of diff3Regions(base, current, intent, (t) => t.key)) {
    if (region.stable) {
      const restyled =
        marksKey(region.current.node) === marksKey(region.base.node) &&
        marksKey(region.intent.node) !== marksKey(region.base.node);
      out.push((restyled ? region.intent : region.current).node);
      continue;
    }
    if (sameKeys(region.current, region.base)) {
      out.push(...region.intent.map((t) => t.node));
    } else if (sameKeys(region.intent, region.base) || sameKeys(region.current, region.intent)) {
      out.push(...region.current.map((t) => t.node));
    } else {
      conflicts.push({
        blockId: `${label}@${region.at}`,
        baseText: tokensText(region.base),
        currentText: tokensText(region.current),
        intentText: tokensText(region.intent),
      });
      out.push(...region.current.map((t) => t.node));
    }
  }
  return joinInline(out);
}

type MergeUnit = { node: JSONContent; sig: string; canon: string };

type UnitMerge = (
  base: MergeUnit,
  current: MergeUnit,
  intent: MergeUnit,
  conflicts: MergeConflict[]
) => JSONContent;

const RAW_PLAN: PlanOptions = { excludeCitations: false };

function unitCanon(node: JSONContent): string {
  return canonicalField({ type: "doc", content: [node] }, RAW_PLAN);
}

function toUnit(node: JSONContent): MergeUnit {
  const canon = unitCanon(node);
  // A table keeps its identity while cells fill; its header row is the key.
  const sig =
    node.type === "table"
      ? `table:${node.content?.[0] ? unitCanon(node.content[0]) : ""}`
      : canon;
  return { node, sig, canon };
}

function joinCanon(units: readonly MergeUnit[]): string {
  return units.map((u) => u.canon).join("\n");
}

/**
 * When `side` only adds units to `base` (e.g. a caption above a table),
 * return each added unit with how many base units precede it.
 */
function insertionsOnly(
  base: readonly MergeUnit[],
  side: readonly MergeUnit[]
): Array<{ gap: number; node: JSONContent }> | null {
  const pairs = lcsPairs(base.map((u) => u.canon), side.map((u) => u.canon));
  if (pairs.size !== base.length) return null;
  const sideToBase = new Map([...pairs].map(([b, s]) => [s, b]));
  const added: Array<{ gap: number; node: JSONContent }> = [];
  let gap = 0;
  side.forEach((unit, s) => {
    const b = sideToBase.get(s);
    if (b !== undefined) {
      gap = b + 1;
      return;
    }
    added.push({ gap, node: unit.node });
  });
  return added;
}

function withInsertions(
  chunk: readonly MergeUnit[],
  added: ReadonlyArray<{ gap: number; node: JSONContent }>
): JSONContent[] {
  return [
    ...added.filter((a) => a.gap === 0).map((a) => a.node),
    ...chunk.map((u) => u.node),
    ...added.filter((a) => a.gap > 0).map((a) => a.node),
  ];
}

/**
 * diff3 over ordered units (blocks, list items, table rows). Units stable on
 * all three sides merge pairwise; changed regions take whichever side moved.
 * Never pairs units by text alone, so blank table rows/cells cannot swap.
 */
function diff3Units(
  base: readonly MergeUnit[],
  current: readonly MergeUnit[],
  intent: readonly MergeUnit[],
  mergeAligned: UnitMerge,
  conflicts: MergeConflict[],
  label: string
): JSONContent[] {
  const out: JSONContent[] = [];
  for (const region of diff3Regions(base, current, intent, (u) => u.sig)) {
    if (region.stable) {
      out.push(mergeAligned(region.base, region.current, region.intent, conflicts));
      continue;
    }
    const { base: baseChunk, current: currentChunk, intent: intentChunk } = region;
    const baseText = joinCanon(baseChunk);
    const currentText = joinCanon(currentChunk);
    const intentText = joinCanon(intentChunk);
    const currentAdded =
      currentText === baseText ? null : insertionsOnly(baseChunk, currentChunk);
    const intentAdded =
      intentText === baseText ? null : insertionsOnly(baseChunk, intentChunk);
    if (currentText === baseText) {
      out.push(...intentChunk.map((u) => u.node));
    } else if (intentText === baseText || currentText === intentText) {
      out.push(...currentChunk.map((u) => u.node));
    } else if (currentAdded) {
      out.push(...withInsertions(intentChunk, currentAdded));
    } else if (intentAdded) {
      out.push(...withInsertions(currentChunk, intentAdded));
    } else if (
      baseChunk.length === currentChunk.length &&
      baseChunk.length === intentChunk.length &&
      baseChunk.every(
        (u, idx) =>
          u.node.type === currentChunk[idx]!.node.type &&
          u.node.type === intentChunk[idx]!.node.type
      )
    ) {
      baseChunk.forEach((u, idx) => {
        out.push(mergeAligned(u, currentChunk[idx]!, intentChunk[idx]!, conflicts));
      });
    } else {
      conflicts.push({ blockId: `${label}@${region.at}`, baseText, currentText, intentText });
      out.push(...currentChunk.map((u) => u.node));
    }
  }
  return out;
}

const INLINE_CONTAINERS = new Set(["paragraph", "heading"]);

function hasBlockChildren(node: JSONContent): boolean {
  return (
    !INLINE_CONTAINERS.has(node.type ?? "") &&
    Array.isArray(node.content) &&
    node.content.every((child) => child.type !== "text")
  );
}

function nodeShell(node: JSONContent): JSONContent {
  const shell = { ...node };
  delete shell.content;
  return shell;
}

/** Type and attrs (heading level, cell widths) from whichever side changed them. */
function pickShell(base: JSONContent, current: JSONContent, intent: JSONContent): JSONContent {
  const baseShell = JSON.stringify(nodeShell(base));
  const intentChanged = JSON.stringify(nodeShell(intent)) !== baseShell;
  const currentChanged = JSON.stringify(nodeShell(current)) !== baseShell;
  return nodeShell(intentChanged && !currentChanged ? intent : current);
}

function mergeRow(
  base: MergeUnit,
  current: MergeUnit,
  intent: MergeUnit,
  conflicts: MergeConflict[]
): JSONContent {
  if (current.canon === intent.canon || intent.canon === base.canon) return current.node;
  if (current.canon === base.canon) return intent.node;
  const baseCells = base.node.content ?? [];
  const currentCells = current.node.content ?? [];
  const intentCells = intent.node.content ?? [];
  if (
    baseCells.length !== currentCells.length ||
    baseCells.length !== intentCells.length
  ) {
    conflicts.push({
      blockId: "row",
      baseText: base.canon,
      currentText: current.canon,
      intentText: intent.canon,
    });
    return current.node;
  }
  const cells = currentCells.map((cell, c) =>
    mergeBlock(toUnit(baseCells[c]!), toUnit(cell), toUnit(intentCells[c]!), conflicts)
  );
  return { ...current.node, content: cells };
}

function mergeBlock(
  base: MergeUnit,
  current: MergeUnit,
  intent: MergeUnit,
  conflicts: MergeConflict[]
): JSONContent {
  if (current.canon === intent.canon || intent.canon === base.canon) return current.node;
  if (current.canon === base.canon) return intent.node;
  const nodes = [base.node, current.node, intent.node];
  const label = current.node.type ?? "block";
  if (nodes.every((n) => n.type === "table")) {
    const rows = diff3Units(
      (base.node.content ?? []).map(toUnit),
      (current.node.content ?? []).map(toUnit),
      (intent.node.content ?? []).map(toUnit),
      mergeRow,
      conflicts,
      "table"
    );
    return { ...current.node, content: rows };
  }
  if (nodes.every((n) => INLINE_CONTAINERS.has(n.type ?? ""))) {
    const content = mergeInline(
      inlineTokens(base.node),
      inlineTokens(current.node),
      inlineTokens(intent.node),
      conflicts,
      label
    );
    return { ...pickShell(base.node, current.node, intent.node), content };
  }
  if (nodes.every((n) => n.type === current.node.type && hasBlockChildren(n))) {
    const content = diff3Units(
      (base.node.content ?? []).map(toUnit),
      (current.node.content ?? []).map(toUnit),
      (intent.node.content ?? []).map(toUnit),
      mergeBlock,
      conflicts,
      label
    );
    return { ...pickShell(base.node, current.node, intent.node), content };
  }
  conflicts.push({
    blockId: label,
    baseText: base.canon,
    currentText: current.canon,
    intentText: intent.canon,
  });
  return current.node;
}

function citationRemap(
  entries: ReadonlyArray<{ number: number; source: string }>,
  numberBySource: Map<string, number>,
  nextNumber: { value: number }
): Map<number, number> {
  const remap = new Map<number, number>();
  for (const entry of entries) {
    let number = numberBySource.get(entry.source);
    if (number === undefined) {
      number = nextNumber.value++;
      numberBySource.set(entry.source, number);
    }
    if (number !== entry.number) remap.set(entry.number, number);
  }
  return remap;
}

/**
 * Structural three-way merge of a rich doc. Each side's citation markers
 * are renumbered onto the live Citations list before blocks are aligned.
 */
function mergeDoc(
  base: JSONContent,
  current: JSONContent,
  intent: JSONContent
): { merged: JSONContent; conflicts: MergeConflict[] } {
  const full = (doc: JSONContent) => normalizeFieldForPlan(doc, RAW_PLAN) as JSONContent;
  const baseFull = full(base);
  const currentFull = full(current);
  const intentFull = full(intent);

  const currentEntries = citationListEntriesFromDoc(currentFull);
  const numberBySource = new Map(currentEntries.map((e) => [e.source, e.number]));
  const nextNumber = {
    value: currentEntries.reduce((max, e) => Math.max(max, e.number), 0) + 1,
  };
  const baseRemap = citationRemap(citationListEntriesFromDoc(baseFull), numberBySource, nextNumber);
  const intentRemap = citationRemap(
    citationListEntriesFromDoc(intentFull),
    numberBySource,
    nextNumber
  );

  const body = (doc: JSONContent, remap: Map<number, number>) =>
    (remapNumericCitationMarkersInDoc(dropTrailingCitationListFromDoc(doc), remap).content ??
      []).map(toUnit);

  const conflicts: MergeConflict[] = [];
  const content = diff3Units(
    body(baseFull, baseRemap),
    body(currentFull, new Map()),
    body(intentFull, intentRemap),
    mergeBlock,
    conflicts,
    "doc"
  );
  const mergedBody: JSONContent = { ...currentFull, content };
  const referenced = citationMarkerNumbersFromDoc(mergedBody);
  const keep = new Set(currentEntries.map((e) => e.number));
  const entries = [...numberBySource.entries()]
    .map(([source, number]) => ({ number, source }))
    .filter((e) => keep.has(e.number) || referenced.has(e.number));
  return { merged: appendCitationListToDoc(mergedBody, entries), conflicts };
}

function asDoc(field: FieldContent): JSONContent {
  if (typeof field !== "string") return field;
  return {
    type: "doc",
    content: field.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

function mergeDivergedField(
  base: FieldContent,
  current: FieldContent,
  intent: FieldContent
): { merged: FieldContent; conflicts: MergeConflict[] } {
  if (typeof base === "string" && typeof current === "string" && typeof intent === "string") {
    const conflicts: MergeConflict[] = [];
    const nodes = mergeInline(
      textTokens(base),
      textTokens(current),
      textTokens(intent),
      conflicts,
      "text"
    );
    return { merged: nodes.map((n) => n.text ?? "").join(""), conflicts };
  }
  const { merged, conflicts } = mergeDoc(asDoc(base), asDoc(current), asDoc(intent));
  return {
    merged: typeof current === "string" ? plainTextFromTiptapJson(merged) : merged,
    conflicts,
  };
}

/**
 * Three-way merge. Citations are stripped before the diff and parked once
 * on the result. Zero operations → noop (caller may dismiss via D-A3, not
 * `resolved`).
 */
export function mergeField(
  base: FieldContent,
  current: FieldContent,
  intent: FieldContent,
  options?: PlanOptions
): ThreeWayMergeResult {
  const planOpts: PlanOptions = { excludeCitations: options?.excludeCitations !== false };
  const baseN = normalizeFieldForPlan(base, planOpts);
  const currentN = normalizeFieldForPlan(current, planOpts);
  const intentN = normalizeFieldForPlan(intent, planOpts);

  if (canonicalField(currentN, planOpts) === canonicalField(intentN, planOpts)) {
    const parkedCurrent = parkCitations(current);
    const parkedIntent = parkCitations(intent);
    const citationAwareOpts: PlanOptions = { excludeCitations: false };
    if (
      canonicalField(parkedCurrent, citationAwareOpts) ===
      canonicalField(parkedIntent, citationAwareOpts)
    ) {
      return { status: "noop", operations: [], merged: parkedCurrent };
    }
    const operations = planFieldDiff(currentN, parkedIntent, planOpts);
    if (operations.length === 0) {
      return { status: "noop", operations: [], merged: parkedIntent };
    }
    return { status: "clean", operations, merged: parkedIntent };
  }

  // Agent commit always passes current === base (FOR UPDATE snapshot). If the
  // live field has not diverged, take intent as-is.
  if (canonicalField(currentN, planOpts) === canonicalField(baseN, planOpts)) {
    const parked = parkCitations(intent);
    const operations = planFieldDiff(currentN, parked, planOpts);
    if (operations.length === 0) {
      return { status: "noop", operations: [], merged: parked };
    }
    return { status: "clean", operations, merged: parked };
  }

  const { merged: structural, conflicts } = mergeDivergedField(base, current, intent);
  const merged = parkCitations(structural);
  const operations = planFieldDiff(currentN, merged, planOpts);
  if (conflicts.length > 0) return { status: "conflict", operations, merged, conflicts };
  if (operations.length === 0) return { status: "noop", operations: [], merged };
  return { status: "clean", operations, merged };
}
