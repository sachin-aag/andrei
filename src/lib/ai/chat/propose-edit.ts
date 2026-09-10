import type { JSONContent } from "@tiptap/core";
import {
  isApplyableStatus,
  probePlainEdit,
  probeRichEdit,
  type EditScope,
  type SuggestionEdit,
} from "@/lib/suggestions/locator";
import { markdownHasTable } from "@/lib/tiptap/markdown-to-doc";
import { summarizeTablesInDoc } from "@/lib/suggestions/table-operation";
import type {
  SuggestionImageInsert,
  SuggestionImageRemove,
} from "@/lib/suggestions/image-insert";

/**
 * Fraction of a field `draft_field` must change to count as a rewrite
 * (`not_a_rewrite` below this). `propose_edit` no longer refuses large spans.
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
  | { status: "table_as_list" };

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

  if (
    insertRestatesTableAsList(edit.insertText, fieldDoc) ||
    replacesTableLeadInWithList(edit.deleteText, edit.insertText)
  ) {
    return { status: "table_as_list" };
  }

  return { status: "ok" };
}

function looksLikeMarkdownList(text: string): boolean {
  const items = text
    .split(/\n+/)
    .filter((line) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(line));
  return items.length >= 2;
}

function insertRestatesTableAsList(
  insertText: string,
  fieldDoc?: JSONContent | null
): boolean {
  if (!fieldDoc || !looksLikeMarkdownList(insertText)) return false;
  const cells = summarizeTablesInDoc(fieldDoc)
    .flatMap((table) => table.cells)
    .filter((cell) => cell.row > 0)
    .map((cell) => cell.text.trim())
    .filter((text) => text.length >= 4 && text !== "(empty)");
  if (cells.length === 0) return false;
  const haystack = insertText.toLowerCase();
  const hits = cells.filter((text) => haystack.includes(text.toLowerCase())).length;
  return hits >= 3 || hits / cells.length >= 0.5;
}

function replacesTableLeadInWithList(deleteText: string, insertText: string): boolean {
  if (!looksLikeMarkdownList(insertText)) return false;
  return /table below|in the table|as detailed in the table|vcs table/i.test(
    deleteText
  );
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
        return "That looks like a table change. Do not use a markdown pipe table as anchorText or insertText — propose_edit cannot create or match it. Call read_section, then edit_table: create_table (headers plus rows) to add a table, edit_cells / insert_rows for an existing one, or delete_table to remove one. Do not fall through to draft_field.";
      }
      return "The anchorText was not found in the current field. Call read_section to get the exact current text, then quote a verbatim longer unique span.";
    case "ambiguous":
      return "The anchorText matches more than once. Include more surrounding words so it is unique, or set `scope` to the exact list item. For tables, use edit_table instead of propose_edit.";
    case "cross_cell":
      return "The edit spans more than one table cell. Use edit_table (edit_cells) instead of propose_edit.";
    case "bad_scope":
      return "The `scope` coordinate does not exist in this field. For tables, call read_section then edit_table. For lists, re-read and use a valid item index.";
    case "table_as_list":
      return "This restates an existing table as a bulleted list. Call read_section, copy tableIndex and [row,col] from tables[] / structuredText, then edit_table (edit_cells to add an example in a cell, or insert_column for a new Example column). Do not convert the table into prose.";
    default: {
      const _exhaustive: never = check;
      return _exhaustive;
    }
  }
}
