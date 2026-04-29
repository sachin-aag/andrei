import type { JSONContent } from "@tiptap/core";
import {
  suggestionInsertMarkName,
  suggestionDeleteMarkName,
  type SuggestionKind,
  type SuggestionStatus,
} from "@/lib/tiptap/suggestion-marks";

/**
 * Server-side equivalent of Tiptap's editor commands for inserting an AI
 * suggestion as a tracked-change pair (suggestionDelete over the anchor +
 * suggestionInsert for the replacement) directly in the persisted JSON doc.
 *
 * Mirrors the whitespace-tolerant matching of `replaceTextInDoc` in rich-text.ts
 * so anchors that drift slightly across save round-trips still match. When the
 * anchor is empty or cannot be found, the replacement is appended as a new
 * paragraph at the end of the section (single edge-case path, per the plan).
 *
 * Returns the new doc plus the ProseMirror absolute positions of the inserted
 * range (where the suggestion comment's fromPos/toPos should anchor).
 */

type InjectAttrs = {
  id: string;
  authorId: string;
  status: SuggestionStatus;
  createdAt: string;
  kind: SuggestionKind;
};

export type InjectResult = {
  doc: JSONContent;
  /** PM range of the freshly-inserted `suggestionInsert` text. */
  insertFromPos: number;
  insertToPos: number;
  /** True when the anchor was located and replaced in place; false when appended at end. */
  anchored: boolean;
};

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Walk JSON doc; for each text node call `cb(node, refIndex, parent)`. */
type TextRef = {
  node: JSONContent;
  /** Parent array reference for splicing if needed. */
  parentArr: JSONContent[];
  /** Index of `node` within parentArr. */
  indexInParent: number;
  /** Original character offset within the flat plain-text view of the doc. */
  flatStart: number;
  flatEnd: number;
};

function collectTextRefs(doc: JSONContent): { refs: TextRef[]; flat: string } {
  const refs: TextRef[] = [];
  let flat = "";

  function visit(node: JSONContent, parentArr: JSONContent[] | null, idx: number) {
    if (node.type === "text") {
      const text = node.text ?? "";
      const start = flat.length;
      flat += text;
      if (parentArr) {
        refs.push({
          node,
          parentArr,
          indexInParent: idx,
          flatStart: start,
          flatEnd: start + text.length,
        });
      }
      return;
    }
    if (node.content?.length) {
      const arr = node.content;
      for (let i = 0; i < arr.length; i++) {
        visit(arr[i]!, arr, i);
        // Insert a soft separator between sibling block children so a multi-paragraph
        // anchor still matches across the paragraph boundary (whitespace collapse
        // will normalize the gap).
        if (
          i < arr.length - 1 &&
          (node.type === "doc" ||
            node.type === "paragraph" ||
            node.type === "heading")
        ) {
          flat += " ";
        }
      }
    }
  }

  visit(doc, null, 0);
  return { refs, flat };
}

/** Compute ProseMirror absolute positions for every text node in the doc. */
function indexPmPositions(doc: JSONContent): Map<JSONContent, { pmStart: number; pmEnd: number }> {
  const map = new Map<JSONContent, { pmStart: number; pmEnd: number }>();

  function walk(node: JSONContent, pos: number): number {
    if (node.type === "text") {
      const len = (node.text ?? "").length;
      map.set(node, { pmStart: pos, pmEnd: pos + len });
      return pos + len;
    }
    if (node.type === "doc") {
      let cursor = pos;
      for (const ch of node.content ?? []) cursor = walk(ch, cursor);
      return cursor;
    }
    let cursor = pos + 1;
    if (node.content?.length) {
      for (const ch of node.content) cursor = walk(ch, cursor);
    }
    return cursor + 1;
  }

  walk(doc, 0);
  return map;
}

function splitTextNode(
  ref: TextRef,
  localStart: number,
  localEnd: number,
  attrs: InjectAttrs
) {
  const original = ref.node.text ?? "";
  const before = original.slice(0, localStart);
  const middle = original.slice(localStart, localEnd);
  const after = original.slice(localEnd);

  const baseMarks = ref.node.marks ?? [];
  const insertMark = {
    type: suggestionInsertMarkName,
    attrs: { ...attrs },
  };
  const deleteMark = {
    type: suggestionDeleteMarkName,
    attrs: { ...attrs },
  };
  void insertMark; // not used in the per-node split path; pair is composed at call site

  // Replace this single text node with potentially three: prefix, marked middle, suffix.
  const replacements: JSONContent[] = [];
  if (before.length > 0) {
    replacements.push({ type: "text", text: before, marks: baseMarks.length ? baseMarks : undefined });
  }
  if (middle.length > 0) {
    replacements.push({
      type: "text",
      text: middle,
      marks: [...baseMarks, deleteMark],
    });
  }
  if (after.length > 0) {
    replacements.push({ type: "text", text: after, marks: baseMarks.length ? baseMarks : undefined });
  }

  ref.parentArr.splice(ref.indexInParent, 1, ...replacements);
}

/** Remove `marks` field if empty so we don't bloat the JSON. */
function cleanupMarks(node: JSONContent) {
  if (node.marks?.length === 0) delete node.marks;
  if (node.content?.length) for (const ch of node.content) cleanupMarks(ch);
}

export function injectSuggestionMarks(
  doc: JSONContent,
  anchorText: string,
  replacementText: string,
  attrs: InjectAttrs
): InjectResult {
  // Deep-clone so we never mutate the caller's reference.
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  const trimmedAnchor = (anchorText ?? "").trim();
  const trimmedReplacement = (replacementText ?? "").trim();

  // ── Edge case: no anchor or empty replacement → append at end ──────────
  // The plan collapses "anchor missing" + "anchor empty" into one path: a
  // brand-new paragraph carrying only the suggestionInsert mark.
  function appendAtEnd(): InjectResult {
    if (!trimmedReplacement) {
      // Nothing to insert; degenerate case.
      return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
    }
    const insertMark = {
      type: suggestionInsertMarkName,
      attrs: { ...attrs },
    };
    const para: JSONContent = {
      type: "paragraph",
      content: [{ type: "text", text: trimmedReplacement, marks: [insertMark] }],
    };
    if (cloned.type !== "doc") {
      return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
    }
    cloned.content = [...(cloned.content ?? []), para];
    // PM positions: end of old doc = (sum of all node sizes). Easiest to
    // re-index after mutation.
    const pmIndex = indexPmPositions(cloned);
    // Find the text node we just inserted (last text in the doc).
    let last: { pmStart: number; pmEnd: number } | null = null;
    for (const [, range] of pmIndex) last = range;
    if (!last) return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
    return {
      doc: cloned,
      insertFromPos: last.pmStart,
      insertToPos: last.pmEnd,
      anchored: false,
    };
  }

  if (!trimmedAnchor || !trimmedReplacement) {
    return appendAtEnd();
  }

  // ── Locate the anchor in the flat text (whitespace-tolerant) ───────────
  const { refs, flat } = collectTextRefs(cloned);
  if (flat.length === 0) return appendAtEnd();

  const collapsedToOrig: number[] = [];
  let collapsed = "";
  let inSpace = true;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        collapsed += " ";
        collapsedToOrig.push(i);
        inSpace = true;
      }
    } else {
      collapsed += ch;
      collapsedToOrig.push(i);
      inSpace = false;
    }
  }
  while (collapsed.endsWith(" ")) {
    collapsed = collapsed.slice(0, -1);
    collapsedToOrig.pop();
  }

  const needle = collapse(trimmedAnchor);
  if (!needle) return appendAtEnd();

  const idx = collapsed.indexOf(needle);
  if (idx === -1) return appendAtEnd();

  const origStart = collapsedToOrig[idx]!;
  const lastCollapsedIdx = idx + needle.length - 1;
  const origEnd = collapsedToOrig[lastCollapsedIdx]! + 1;

  // ── Wrap the matched range in suggestionDelete by splitting affected refs ──
  // Walk affected refs in REVERSE so earlier indices remain valid as we splice.
  const affected = refs.filter((r) => r.flatEnd > origStart && r.flatStart < origEnd);
  if (affected.length === 0) return appendAtEnd();

  for (let i = affected.length - 1; i >= 0; i--) {
    const r = affected[i]!;
    const localStart = Math.max(0, origStart - r.flatStart);
    const localEnd = Math.min(r.flatEnd - r.flatStart, origEnd - r.flatStart);
    if (localStart >= localEnd) continue;
    splitTextNode(r, localStart, localEnd, attrs);
  }

  // ── Insert the replacement as a new text node carrying suggestionInsert ──
  // Place it immediately after the LAST node containing the deleted range.
  // We re-collect refs because the splits invalidated indices.
  const recollected = collectTextRefs(cloned);
  // Find the last node whose marks include suggestionDelete with our id.
  const ourId = attrs.id;
  let insertAfter: TextRef | null = null;
  for (const r of recollected.refs) {
    const hasOurDelete = (r.node.marks ?? []).some(
      (m) =>
        m.type === suggestionDeleteMarkName &&
        (m.attrs as { id?: string } | undefined)?.id === ourId
    );
    if (hasOurDelete) insertAfter = r;
  }
  if (!insertAfter) {
    // Splits didn't take — fall back to append-at-end.
    return appendAtEnd();
  }

  const insertMark = {
    type: suggestionInsertMarkName,
    attrs: { ...attrs },
  };
  // Strip any base marks the surrounding text carried that conflict (we
  // intentionally only carry the suggestionInsert mark on the new text).
  const insertedNode: JSONContent = {
    type: "text",
    text: trimmedReplacement,
    marks: [insertMark],
  };
  insertAfter.parentArr.splice(insertAfter.indexInParent + 1, 0, insertedNode);

  cleanupMarks(cloned);

  // Compute PM positions for the inserted node.
  const pmIndex = indexPmPositions(cloned);
  const range = pmIndex.get(insertedNode);
  if (!range) {
    return { doc: cloned, insertFromPos: 0, insertToPos: 0, anchored: false };
  }
  return {
    doc: cloned,
    insertFromPos: range.pmStart,
    insertToPos: range.pmEnd,
    anchored: true,
  };
}

/**
 * Strip every `suggestionInsert` / `suggestionDelete` mark whose `id` matches
 * `markId`. Used by the reconciliation path: when a re-eval supersedes a prior
 * (still-pending) AI suggestion, we wipe its marks before injecting fresh ones.
 *
 * Unlike a "dumb" strip, this removes:
 *   - the suggestionDelete mark from kept text (the original anchor returns).
 *   - the entire text node carrying suggestionInsert (the proposed replacement vanishes).
 */
export function stripSuggestionMarksById(doc: JSONContent, markId: string): JSONContent {
  const cloned: JSONContent = JSON.parse(JSON.stringify(doc));

  function visit(node: JSONContent) {
    if (node.content?.length) {
      // First recurse so nested cleanup happens before we filter at this level.
      for (const ch of node.content) visit(ch);

      // Drop text nodes that carry suggestionInsert with our id.
      node.content = node.content.filter((ch) => {
        if (ch.type !== "text") return true;
        const marks = ch.marks ?? [];
        return !marks.some(
          (m) =>
            m.type === suggestionInsertMarkName &&
            (m.attrs as { id?: string } | undefined)?.id === markId
        );
      });

      // Strip suggestionDelete marks with our id from remaining text nodes.
      for (const ch of node.content) {
        if (ch.type !== "text" || !ch.marks?.length) continue;
        ch.marks = ch.marks.filter(
          (m) =>
            !(
              m.type === suggestionDeleteMarkName &&
              (m.attrs as { id?: string } | undefined)?.id === markId
            )
        );
        if (ch.marks.length === 0) delete ch.marks;
      }
    }
  }

  visit(cloned);
  return cloned;
}
