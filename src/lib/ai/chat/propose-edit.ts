import type { JSONContent } from "@tiptap/core";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type EditScope,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import type {
  SuggestionImageInsert,
  SuggestionImageRemove,
} from "@/lib/suggestions/image-insert";

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
  | { status: "bad_scope" };

/**
 * Validate a proposed targeted edit against the current field.
 * Coverage classifies later (edit vs rewrite); this check never rejects
 * a uniquely located span for size.
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

  const status = fieldDoc
    ? probeRichEdit(fieldDoc, suggestionEdit)
    : probePlainEdit(fieldPlainText, suggestionEdit);
  if (!isApplyableStatus(status)) {
    if (status === "ambiguous") return { status: "ambiguous" };
    if (status === "cross_cell") return { status: "cross_cell" };
    if (status === "bad_scope") return { status: "bad_scope" };
    return { status: "not_found" };
  }

  return { status: "ok" };
}

/** Agent-facing repair hint for a non-ok check result. */
export function looksLikeTableEdit(
  anchorText: string,
  fieldDoc?: JSONContent | null
): boolean {
  if (/\|.+\|/.test(anchorText)) return true;
  if (!fieldDoc) return false;
  const walk = (node: JSONContent): boolean =>
    node.type === "table" || Boolean(node.content?.some(walk));
  return walk(fieldDoc);
}

export function proposedEditHint(
  check: ProposedEditCheck,
  opts?: { anchorText?: string; fieldDoc?: JSONContent | null }
): string {
  switch (check.status) {
    case "ok":
      return "";
    case "not_found":
      if (looksLikeTableEdit(opts?.anchorText ?? "", opts?.fieldDoc)) {
        return "That looks like a table change. Do not use a markdown pipe table as anchorText — propose_edit cannot match it. Call read_section, then edit_table with tableIndex and [row,col] from structuredText. Do not fall through to draft_field.";
      }
      return "The anchorText was not found in the current field. Call read_section to get the exact current text, then quote a verbatim span.";
    case "ambiguous":
      return "The anchorText matches more than once. Include more surrounding words so it is unique, or set `scope` to the exact list item. For tables, use edit_table instead of propose_edit.";
    case "cross_cell":
      return "The edit spans more than one table cell. Use edit_table (edit_cells) instead of propose_edit.";
    case "bad_scope":
      return "The `scope` coordinate does not exist in this field. For tables, call read_section then edit_table. For lists, re-read and use a valid item index.";
    default: {
      const _exhaustive: never = check;
      return _exhaustive;
    }
  }
}
