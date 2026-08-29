import type { JSONContent } from "@tiptap/core";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type EditScope,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";
import { markdownHasTable } from "@/lib/tiptap/markdown-to-doc";
import type {
  SuggestionImageInsert,
  SuggestionImageRemove,
} from "@/lib/suggestions/image-insert";

/**
 * Fraction of a field a single `propose_edit` may delete before it should be
 * routed to a block-level redraft instead of an inline word-diff. Tunable
 * safety valve — not a UX toggle (see Tier-2 `draft_section`).
 */
export const REDRAFT_COVERAGE_THRESHOLD = 0.5;

export type ProposedEditInput = {
  anchorText: string;
  deleteText: string;
  insertText: string;
  insertImage?: SuggestionImageInsert;
  removeImage?: SuggestionImageRemove;
  scope?: EditScope;
  second?: Omit<SuggestionEdit, "second">;
};

export type ProposedEditCheck =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "ambiguous" }
  | { status: "cross_cell" }
  | { status: "bad_scope" }
  | { status: "too_large"; coverage: number };

/**
 * Validate a proposed targeted edit against the current field:
 * 1. It must locate uniquely (delegates to the shared suggestion locator).
 * 2. A delete must not cover more than {@link REDRAFT_COVERAGE_THRESHOLD} of
 *    the field — larger changes are rewrites and belong to a block redraft.
 *
 * When `fieldDoc` is supplied (rich fields), validation runs against the doc so
 * a structural `scope` resolves and cross-cell / bad-coordinate edits are caught
 * at propose time rather than silently failing at accept time.
 *
 * Pure + DB-free so it is unit-testable in isolation.
 */
export function checkProposedEdit(
  fieldPlainText: string,
  edit: ProposedEditInput,
  fieldDoc?: JSONContent | null
): ProposedEditCheck {
  const suggestionEdit: SuggestionEdit = {
    anchorText: edit.anchorText,
    deleteText: edit.deleteText,
    insertText: edit.insertText,
    insertImage: edit.insertImage,
    removeImage: edit.removeImage,
    scope: edit.scope,
    second: edit.second,
  };

  if (
    markdownHasTable(edit.insertText) ||
    markdownHasTable(edit.anchorText) ||
    markdownHasTable(edit.second?.insertText ?? "")
  ) {
    return { status: "not_found" };
  }

  const status = fieldDoc
    ? probeRichEdit(fieldDoc, suggestionEdit)
    : probePlainEdit(fieldPlainText, suggestionEdit);
  if (!isApplyableStatus(status)) {
    if (status === "ambiguous") return { status: "ambiguous" };
    if (status === "cross_cell") return { status: "cross_cell" };
    if (status === "bad_scope") return { status: "bad_scope" };
    return { status: "not_found" };
  }

  // A scoped edit replaces at most one cell / list item, which is a small part
  // of the whole field even when it rewrites that cell — skip the coverage
  // guard (it exists to catch whole-field rewrites masquerading as edits).
  const del = collapseWhitespace(edit.deleteText ?? "");
  if (!edit.scope && del.length > 0) {
    const fieldLen = Math.max(1, collapseWhitespace(fieldPlainText).length);
    const coverage = del.length / fieldLen;
    if (coverage > REDRAFT_COVERAGE_THRESHOLD) {
      return { status: "too_large", coverage };
    }
  }

  return { status: "ok" };
}

/** Agent-facing repair hint for a non-ok check result. */
export function looksLikeTableEdit(
  anchorText: string,
  fieldDoc?: JSONContent | null,
  insertText?: string
): boolean {
  if (markdownHasTable(anchorText) || markdownHasTable(insertText ?? "")) {
    return true;
  }
  if (/\|.+\|/.test(anchorText) || /\|.+\|/.test(insertText ?? "")) return true;
  if (!fieldDoc) return false;
  const walk = (node: JSONContent): boolean =>
    node.type === "table" || Boolean(node.content?.some(walk));
  return walk(fieldDoc);
}

export function proposedEditHint(
  check: ProposedEditCheck,
  opts?: {
    anchorText?: string;
    insertText?: string;
    fieldDoc?: JSONContent | null;
  }
): string {
  switch (check.status) {
    case "ok":
      return "";
    case "not_found":
      if (
        looksLikeTableEdit(
          opts?.anchorText ?? "",
          opts?.fieldDoc,
          opts?.insertText
        )
      ) {
        return "That looks like a table change. Do not use a markdown pipe table as anchorText or insertText — propose_edit cannot create or match it. Call read_section, then edit_table: create_table (headers plus rows) to add a table, or edit_cells / insert_rows for an existing one. Do not fall through to draft_field.";
      }
      return "The anchorText was not found in the current field. Call read_section to get the exact current text, then quote a verbatim longer unique span.";
    case "ambiguous":
      return "The anchorText matches more than once. Include more surrounding words so it is unique, or set `scope` to the exact list item. For tables, use edit_table instead of propose_edit.";
    case "cross_cell":
      return "The edit spans more than one table cell. Use edit_table (edit_cells) instead of propose_edit.";
    case "bad_scope":
      return "The `scope` coordinate does not exist in this field. For tables, call read_section then edit_table. For lists, re-read and use a valid item index.";
    case "too_large":
      return "This change rewrites most of the field. Make a smaller, targeted edit, or use draft_field for an explicit full replacement. To add a new table, use edit_table with kind create_table — not draft_field.";
    default: {
      const _exhaustive: never = check;
      return _exhaustive;
    }
  }
}
