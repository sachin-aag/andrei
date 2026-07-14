import {
  canLocateEditInPlainText,
  type SuggestionEdit,
} from "@/lib/tiptap/suggestion-inject";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";

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
};

export type ProposedEditCheck =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "ambiguous" }
  | { status: "too_large"; coverage: number };

/**
 * Validate a proposed targeted edit against the current field text:
 * 1. It must locate uniquely (delegates to the shared suggestion locator).
 * 2. A delete must not cover more than {@link REDRAFT_COVERAGE_THRESHOLD} of
 *    the field — larger changes are rewrites and belong to a block redraft.
 *
 * Pure + DB-free so it is unit-testable in isolation.
 */
export function checkProposedEdit(
  fieldPlainText: string,
  edit: ProposedEditInput
): ProposedEditCheck {
  const suggestionEdit: SuggestionEdit = {
    anchorText: edit.anchorText,
    deleteText: edit.deleteText,
    insertText: edit.insertText,
  };

  const loc = canLocateEditInPlainText(fieldPlainText, suggestionEdit);
  if (!loc.ok) return { status: loc.reason };

  const del = collapseWhitespace(edit.deleteText ?? "");
  if (del.length > 0) {
    const fieldLen = Math.max(1, collapseWhitespace(fieldPlainText).length);
    const coverage = del.length / fieldLen;
    if (coverage > REDRAFT_COVERAGE_THRESHOLD) {
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
      return "The anchorText was not found in the current field. Call read_section to get the exact current text, then quote a verbatim span.";
    case "ambiguous":
      return "The anchorText matches more than once. Include more surrounding words so it is unique.";
    case "too_large":
      return "This change rewrites most of the field. Make a smaller, targeted edit (block redraft is not available yet in this mode).";
    default: {
      const _exhaustive: never = check;
      return _exhaustive;
    }
  }
}
