import type { JSONContent } from "@tiptap/core";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type EditScope,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";

/**
 * Fraction of a field a single `propose_edit` may delete before it should be
 * routed to a block-level redraft instead of an inline word-diff. Tunable
 * safety valve — not a UX toggle (see Tier-2 `draft_section`).
 */
export const REDRAFT_COVERAGE_THRESHOLD = 0.5;

/**
 * Fields shorter than this are exempt from the coverage guard. In a two-sentence
 * field, changing one sentence legitimately covers more than half the text —
 * refusing it pushed the model to redraft the whole field, which is exactly the
 * oversized suggestion the guard exists to prevent.
 */
export const COVERAGE_GUARD_MIN_FIELD_CHARS = 400;

export type ProposedEditInput = {
  anchorText: string;
  deleteText: string;
  insertText: string;
  scope?: EditScope;
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
    scope: edit.scope,
  };

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
    if (
      fieldLen >= COVERAGE_GUARD_MIN_FIELD_CHARS &&
      coverage > REDRAFT_COVERAGE_THRESHOLD
    ) {
      return { status: "too_large", coverage };
    }
  }

  return { status: "ok" };
}

/** Agent-facing repair hint for a non-ok check result. */
export function proposedEditHint(check: ProposedEditCheck): string {
  switch (check.status) {
    case "ok":
      return "";
    case "not_found":
      return "The anchorText was not found in the current field. If you are revising an open proposal, pass supersedes with its id (the system also merges overlapping open cards). Otherwise call read_section and quote a verbatim span from the live text.";
    case "ambiguous":
      return "The anchorText matches more than once. Include more surrounding words so it is unique, or set `scope` to the exact table cell / list item.";
    case "cross_cell":
      return "The edit spans more than one table cell. Set `scope` to a single cell ({kind:'cell',row,col}) and keep deleteText/insertText within that cell.";
    case "bad_scope":
      return "The `scope` coordinate does not exist in this field. Re-read the field with read_section and use a valid R#/C# cell or list item index.";
    case "too_large":
      return "This change rewrites most of the field. Make a smaller, targeted edit, or use draft_field — it splits a full draft into one card per changed block.";
    default: {
      const _exhaustive: never = check;
      return _exhaustive;
    }
  }
}
