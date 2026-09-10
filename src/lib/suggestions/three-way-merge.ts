/**
 * Pure, isomorphic three-way merge of a field. Supersession is a pre-pass
 * elsewhere — it is not a merge outcome.
 *
 * Given base (what the model saw), current (live field), and intent (what
 * the model wants), reconcile per block. Conflicts stay scoped to the
 * block; they never reject the rest of the suggestion.
 */
import type { JSONContent } from "@tiptap/core";
import { diffWords } from "diff";
import {
  applyFieldPlan,
  canonicalField,
  extractMergeBlocks,
  normalizeFieldForPlan,
  planFieldDiff,
  type FieldContent,
  type MergeBlock,
  type PlanOptions,
  type PlannedOperation,
} from "@/lib/suggestions/diff-plan";
import {
  moveCitationsToEndOfText,
  normalizeTrailingCitationBlockInDoc,
} from "@/lib/suggestions/citations-at-end";

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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parkCitations(field: FieldContent): FieldContent {
  if (typeof field === "string") return moveCitationsToEndOfText(field);
  return normalizeTrailingCitationBlockInDoc(field);
}

function fullMergeBlock(
  block: MergeBlock,
  byId: ReadonlyMap<string, MergeBlock>
): MergeBlock {
  return byId.get(block.id) ?? block;
}

function mergeBlockMaps(
  blocks: readonly MergeBlock[]
): Map<string, MergeBlock> {
  return new Map(blocks.map((block) => [block.id, block]));
}

function matchBlocks(
  ancestor: MergeBlock[],
  side: MergeBlock[]
): Array<{ ancestor: MergeBlock; side: MergeBlock | null }> {
  const used = new Set<number>();
  return ancestor.map((block) => {
    let found = -1;
    for (let i = 0; i < side.length; i++) {
      if (used.has(i)) continue;
      const candidate = side[i]!;
      if (candidate.kind !== block.kind) continue;
      if (candidate.text === block.text) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      for (let i = 0; i < side.length; i++) {
        if (used.has(i)) continue;
        const candidate = side[i]!;
        if (candidate.kind !== block.kind) continue;
        if (candidate.index === block.index) {
          found = i;
          break;
        }
      }
    }
    if (found < 0) return { ancestor: block, side: null };
    used.add(found);
    return { ancestor: block, side: side[found]! };
  });
}

function overlappingWordChanges(base: string, a: string, b: string): boolean {
  if (a === b || a === base || b === base) return false;
  const da = diffWords(base, a);
  const db = diffWords(base, b);
  const rangesA: Array<{ start: number; end: number }> = [];
  const rangesB: Array<{ start: number; end: number }> = [];
  let offset = 0;
  for (const part of da) {
    if (part.removed) {
      rangesA.push({ start: offset, end: offset + part.value.length });
      offset += part.value.length;
      continue;
    }
    if (part.added) continue;
    offset += part.value.length;
  }
  offset = 0;
  for (const part of db) {
    if (part.removed) {
      rangesB.push({ start: offset, end: offset + part.value.length });
      offset += part.value.length;
      continue;
    }
    if (part.added) continue;
    offset += part.value.length;
  }
  for (const ra of rangesA) {
    for (const rb of rangesB) {
      if (ra.start < rb.end && rb.start < ra.end) return true;
    }
  }
  return false;
}

function mergePlainText(base: string, current: string, intent: string): string | "conflict" {
  if (current === intent) return current;
  if (current === base) return intent;
  if (intent === base) return current;
  if (overlappingWordChanges(base, current, intent)) return "conflict";
  // Non-overlapping: apply intent's word diff onto current via current-as-new-base
  // by preferring intent's changed spans on an otherwise current string.
  const intentParts = diffWords(base, intent);
  let cursor = 0;
  let out = "";
  const currentFromBase = diffWords(base, current);
  // If both only insert at different offsets, splice intent inserts into current.
  const currentInserts = currentFromBase.filter((p) => p.added).map((p) => p.value);
  const intentInserts = intentParts.filter((p) => p.added).map((p) => p.value);
  if (
    currentFromBase.every((p) => !p.removed) &&
    intentParts.every((p) => !p.removed)
  ) {
    // both pure inserts — concatenate unique inserts after shared base
    const mergedInserts = [...currentInserts];
    for (const ins of intentInserts) {
      if (!mergedInserts.includes(ins)) mergedInserts.push(ins);
    }
    return base + mergedInserts.join("");
  }
  for (const part of intentParts) {
    if (part.added) {
      out += part.value;
      continue;
    }
    if (part.removed) {
      cursor += part.value.length;
      continue;
    }
    out += current.slice(cursor, cursor + part.value.length) || part.value;
    cursor += part.value.length;
  }
  return out;
}

function rebuildDocWithTableCells(
  template: JSONContent,
  blocks: MergeBlock[]
): JSONContent {
  const doc = cloneJson(template);
  const cells = blocks.filter((b) => b.kind === "table_cell");
  let i = 0;
  const walk = (node: JSONContent) => {
    if (node.type === "table") {
      for (const row of node.content ?? []) {
        if (row.type !== "tableRow" || !row.content) continue;
        for (let c = 0; c < row.content.length; c++) {
          const next = cells[i++];
          if (next && typeof next.node !== "string") {
            row.content[c] = cloneJson(next.node) as JSONContent;
          }
        }
      }
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return doc;
}

function rebuildFromBlocks(template: FieldContent, blocks: MergeBlock[]): FieldContent {
  if (typeof template === "string") {
    return blocks.map((b) => (typeof b.node === "string" ? b.node : b.text)).join("\n");
  }
  // Table cells are not top-level nodes. Flattening them into a fake doc makes
  // extractMergeBlocks treat inner paragraphs as prose, then applyFieldPlan
  // removes columns and spills header/body text after the table.
  if (blocks.some((b) => b.kind === "table_cell")) {
    return rebuildDocWithTableCells(template, blocks);
  }
  const ops = planFieldDiff(
    template,
    {
      type: "doc",
      content: blocks.map((b) =>
        typeof b.node === "string"
          ? { type: "paragraph", content: b.node ? [{ type: "text", text: b.node }] : [] }
          : (b.node as JSONContent)
      ),
    },
    { excludeCitations: true }
  );
  // When the template is already a doc, replace top-level content with block nodes
  // that are themselves top-level (prose). Nested table/list cells keep their nodes
  // via applyFieldPlan replaces.
  if (blocks.every((b) => b.kind === "prose" || b.kind === "list_item" || b.kind === "other")) {
    return {
      type: "doc",
      content: blocks.map((b) => cloneJson(b.node) as JSONContent),
    };
  }
  return applyFieldPlan(template, ops, { excludeCitations: true });
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

  // Agent commit always passes current === base (FOR UPDATE snapshot). Rebuilding
  // table cells through a flattened doc collapses a 5-col DV matrix to leftover
  // prose. If the live field has not diverged, take intent as-is.
  if (canonicalField(currentN, planOpts) === canonicalField(baseN, planOpts)) {
    const parked = parkCitations(intent);
    const operations = planFieldDiff(currentN, parked, planOpts);
    if (operations.length === 0) {
      return { status: "noop", operations: [], merged: parked };
    }
    return { status: "clean", operations, merged: parked };
  }

  const baseBlocks = extractMergeBlocks(baseN, planOpts);
  const currentBlocks = extractMergeBlocks(currentN, planOpts);
  const intentBlocks = extractMergeBlocks(intentN, planOpts);
  const currentBlocksFull = extractMergeBlocks(current, { excludeCitations: false });
  const intentBlocksFull = extractMergeBlocks(intent, { excludeCitations: false });
  const currentFullById = mergeBlockMaps(currentBlocksFull);
  const intentFullById = mergeBlockMaps(intentBlocksFull);

  const currentMatch = matchBlocks(baseBlocks, currentBlocks);
  const intentMatch = matchBlocks(baseBlocks, intentBlocks);
  const conflicts: MergeConflict[] = [];
  const mergedBlocks: MergeBlock[] = [];
  const usedCurrent = new Set<string>();
  const usedIntent = new Set<string>();

  for (let i = 0; i < baseBlocks.length; i++) {
    const ancestor = baseBlocks[i]!;
    const cur = currentMatch[i]?.side ?? null;
    const inn = intentMatch[i]?.side ?? null;
    if (cur) usedCurrent.add(cur.id);
    if (inn) usedIntent.add(inn.id);

    const curText = cur?.text ?? "";
    const innText = inn?.text ?? "";
    const baseText = ancestor.text;

    if (!cur && !inn) continue;
    if (!cur && inn) {
      mergedBlocks.push(fullMergeBlock(inn, intentFullById));
      continue;
    }
    if (cur && !inn) {
      mergedBlocks.push(fullMergeBlock(cur, currentFullById));
      continue;
    }
    if (cur && inn) {
      if (curText === innText) {
        mergedBlocks.push(fullMergeBlock(cur, currentFullById));
        continue;
      }
      if (curText === baseText) {
        mergedBlocks.push(fullMergeBlock(inn, intentFullById));
        continue;
      }
      if (innText === baseText) {
        mergedBlocks.push(fullMergeBlock(cur, currentFullById));
        continue;
      }
      if (cur.kind === "plain_line" || typeof cur.node === "string") {
        const mergedText = mergePlainText(baseText, curText, innText);
        if (mergedText === "conflict") {
          conflicts.push({
            blockId: ancestor.id,
            baseText,
            currentText: curText,
            intentText: innText,
          });
          mergedBlocks.push(fullMergeBlock(cur, currentFullById));
          continue;
        }
        mergedBlocks.push({ ...cur, text: mergedText, node: mergedText });
        continue;
      }
      const mergedText = mergePlainText(baseText, curText, innText);
      if (mergedText === "conflict") {
        conflicts.push({
          blockId: ancestor.id,
          baseText,
          currentText: curText,
          intentText: innText,
        });
        mergedBlocks.push(fullMergeBlock(cur, currentFullById));
        continue;
      }
      const nextNode =
        typeof inn.node === "string"
          ? inn.node
          : {
              ...(cloneJson(inn.node) as JSONContent),
              content: mergedText
                ? [{ type: "text", text: mergedText }]
                : [],
            };
      mergedBlocks.push({
        ...inn,
        text: mergedText,
        node: nextNode,
      });
    }
  }

  for (const block of currentBlocksFull) {
    if (!usedCurrent.has(block.id)) {
      mergedBlocks.push(block);
    }
  }
  for (const block of intentBlocksFull) {
    if (!usedIntent.has(block.id)) {
      const duplicate = mergedBlocks.some(
        (b) => b.kind === block.kind && b.text === block.text
      );
      if (!duplicate) mergedBlocks.push(block);
    }
  }

  const merged = parkCitations(rebuildFromBlocks(current, mergedBlocks));
  const operations = planFieldDiff(currentN, merged, planOpts);

  if (conflicts.length > 0) {
    return { status: "conflict", operations, merged, conflicts };
  }
  if (operations.length === 0) {
    return { status: "noop", operations: [], merged };
  }
  return { status: "clean", operations, merged };
}
