import type { JSONContent } from "@tiptap/core";
import type { SectionType } from "@/db/schema";
import type { CommentRecord, EvaluationRecord } from "@/types/report";
import {
  parseAiFixCommentContent,
  sortedOpenSuggestionsForSection,
} from "@/lib/ai/suggestion-gating";
import { isRichTargetField } from "@/lib/ai/suggest-target-fields";
import { buildBlockChain } from "@/lib/suggestions/block-chain";
import {
  locateBlockIndex,
  locateRowIndex,
  locateTableBlockIndex,
  resolveInsertAfterIndex,
  type BlockChain,
} from "@/lib/suggestions/block-redraft";
import { flattenForAnchor, locateEdit } from "@/lib/suggestions/locator";
import { getPlainTextFieldValue } from "@/lib/suggestions/plain-text-field-value";
import { getRichFieldValue } from "@/lib/suggestions/rich-field-value";
import { effectivePlainTextContentPath } from "@/lib/suggestions/resolve-suggestion-field-path";
import { suggestionEditFromComment } from "@/lib/suggestions/validate-suggestion";

/** Sorts last: a suggestion whose target can no longer be found in the field. */
const UNPLACED = Number.MAX_SAFE_INTEGER;

/**
 * Start offset of each top-level block in the canonical flat string. Blocks are
 * joined by a single "\n" (`flattenForAnchor`'s stated policy), so summing each
 * block's own flattened length plus one reproduces the same coordinates.
 */
function blockStartOffsets(doc: JSONContent): number[] {
  const offsets: number[] = [];
  let at = 0;
  for (const block of doc.content ?? []) {
    offsets.push(at);
    at += flattenForAnchor(block).text.length + 1;
  }
  return offsets;
}

function richBlockOffset(
  doc: JSONContent,
  comment: CommentRecord,
  chain?: BlockChain
): number {
  const op = parseAiFixCommentContent(comment.content).blockEdit;
  if (!op) return UNPLACED;
  const offsets = blockStartOffsets(doc);
  const end = flattenForAnchor(doc).text.length;

  if (op.op === "insert") {
    // An insert sits just after the block it follows; an unresolved chain means
    // "append", which belongs at the end of the queue for this field.
    const after = resolveInsertAfterIndex(doc, op, chain);
    return after < 0 ? end : (offsets[after + 1] ?? end);
  }

  if (op.op === "insertRow" || op.op === "deleteRow") {
    const tableIdx = locateTableBlockIndex(doc, op);
    if (tableIdx < 0) return UNPLACED;
    const base = offsets[tableIdx] ?? UNPLACED;
    if (base === UNPLACED) return UNPLACED;
    const table = doc.content?.[tableIdx];
    // Rows inside one table keep their own order.
    const rowIdx = table ? locateRowIndex(table, op) : -1;
    return base + Math.max(0, rowIdx);
  }

  const idx = locateBlockIndex(doc, op);
  return idx < 0 ? UNPLACED : (offsets[idx] ?? UNPLACED);
}

/**
 * Where in the field this suggestion applies, as a character offset in the
 * canonical flat string.
 *
 * Chat-drafted suggestions have no criterion severity to rank by, so document
 * order is what makes a multi-block draft readable: the engineer walks the
 * queue top to bottom through the section instead of in database insert order.
 */
export function suggestionDocumentOffset(
  section: SectionType,
  comment: CommentRecord,
  sectionContent: unknown,
  chain?: BlockChain
): number {
  const record = sectionContent as Record<string, unknown>;
  if (!record) return UNPLACED;
  const path = effectivePlainTextContentPath(section, comment.contentPath);

  // A whole-field redraft has no position within the field.
  if (comment.kind === "ai_redraft") return 0;

  try {
    if (isRichTargetField(section, path)) {
      const doc = getRichFieldValue(record, path);
      if (parseAiFixCommentContent(comment.content).blockEdit) {
        return richBlockOffset(doc, comment, chain);
      }
      const located = locateEdit(
        flattenForAnchor(doc).text,
        suggestionEditFromComment(comment)
      );
      return located.status === "located" ? located.deleteStart : UNPLACED;
    }

    const plain = getPlainTextFieldValue(record, path);
    const located = locateEdit(plain, suggestionEditFromComment(comment));
    return located.status === "located" ? located.deleteStart : UNPLACED;
  } catch {
    return UNPLACED;
  }
}

/**
 * Comparator for the chat-drafted suggestions in one section: field path first
 * (a draft targets one field, so this only separates unrelated drafts), then
 * position within that field.
 */
function compareByDocumentPosition(
  section: SectionType,
  a: CommentRecord,
  b: CommentRecord,
  sectionContent: unknown,
  chain?: BlockChain
): number {
  const pathA = a.contentPath ?? "";
  const pathB = b.contentPath ?? "";
  if (pathA !== pathB) return pathA.localeCompare(pathB);
  const offsetA = suggestionDocumentOffset(section, a, sectionContent, chain);
  const offsetB = suggestionDocumentOffset(section, b, sectionContent, chain);
  if (offsetA !== offsetB) return offsetA - offsetB;
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * The section's open suggestion queue.
 *
 * Criterion-linked suggestions (from "Suggest fixes") keep their red-then-yellow
 * severity ordering — severity is the useful signal there. Chat-drafted ones
 * have no criterion, so they are ordered by where they apply in the document:
 * a draft that arrives as five blocks is then reviewed top to bottom instead of
 * in database insert order, and a revision that supersedes an earlier proposal
 * reappears in the same place rather than at the back of the queue.
 *
 * Falls back to `sortedOpenSuggestionsForSection` when the section content is
 * not available to position against.
 */
export function sortedOpenSuggestionsInDocumentOrder(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[],
  sectionContent?: unknown
): CommentRecord[] {
  const base = sortedOpenSuggestionsForSection(section, comments, evaluations);
  if (sectionContent == null) return base;

  const chain = buildBlockChain(comments);
  const criterionLinked = base.filter((c) => c.evaluationId != null);
  const chatDrafted = base
    .filter((c) => c.evaluationId == null)
    .sort((a, b) => compareByDocumentPosition(section, a, b, sectionContent, chain));
  return [...criterionLinked, ...chatDrafted];
}

export function activeSuggestionInDocumentOrder(
  section: SectionType,
  comments: CommentRecord[],
  evaluations: EvaluationRecord[],
  sectionContent?: unknown
): CommentRecord | null {
  return (
    sortedOpenSuggestionsInDocumentOrder(
      section,
      comments,
      evaluations,
      sectionContent
    )[0] ?? null
  );
}
