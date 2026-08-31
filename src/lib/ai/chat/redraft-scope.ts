import { diffWords } from "diff";
import type { JSONContent } from "@tiptap/core";
import { REDRAFT_COVERAGE_THRESHOLD } from "@/lib/ai/chat/propose-edit";
import { collapseWhitespace } from "@/lib/text/normalize-for-anchor";

/**
 * Fraction of the current field a `draft_field` replacement actually removes.
 *
 * Mirrors the `propose_edit` coverage measure so the two tools meet at
 * {@link REDRAFT_COVERAGE_THRESHOLD} with no gap: above it a change is a
 * rewrite, at or below it a targeted edit.
 */
export function redraftDeleteCoverage(
  currentText: string,
  nextText: string
): number {
  const current = collapseWhitespace(currentText);
  const next = collapseWhitespace(nextText);
  if (!current) return 1;
  if (current === next) return 0;

  let removed = 0;
  for (const part of diffWords(current, next)) {
    if (part.removed) removed += part.value.length;
  }
  return Math.min(1, removed / current.length);
}

export function docHasTable(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false;
  if (doc.type === "table") return true;
  return (doc.content ?? []).some(docHasTable);
}

export type RedraftScope =
  | { kind: "rewrite" }
  | { kind: "targeted_edit"; coverage: number }
  | { kind: "table_structure"; adding: boolean };

/**
 * Classify what a `draft_field` call is really doing to a filled field.
 *
 * A replacement that leaves most of the field intact is a targeted edit
 * written as a whole-field draft. Accepting it would strike the entire field
 * in review even though a few spans changed, so it belongs on `propose_edit`.
 * Adding or removing a table while keeping most of the prose is the same:
 * `edit_table` create_table / delete_table inserts or drops the table without
 * striking the surrounding text. A genuine rewrite (more than half the field)
 * may still add or drop a table — that stays a rewrite.
 */
export function classifyRedraftScope(args: {
  currentText: string;
  nextText: string;
  currentHasTable: boolean;
  nextHasTable: boolean;
}): RedraftScope {
  const coverage = redraftDeleteCoverage(args.currentText, args.nextText);
  if (coverage > REDRAFT_COVERAGE_THRESHOLD) return { kind: "rewrite" };
  if (args.currentHasTable !== args.nextHasTable) {
    return {
      kind: "table_structure",
      adding: !args.currentHasTable && args.nextHasTable,
    };
  }
  return { kind: "targeted_edit", coverage };
}

export function redraftTooSmallHint(coverage: number): string {
  const percent = Math.round(coverage * 100);
  return `This replacement keeps ${100 - percent}% of the field — it is a targeted edit, not a rewrite, and draft_field would strike the whole field in review. Call read_section, then propose_edit. Nearby wording in the same field belongs in one call (span the unchanged words between); distant paragraphs can be separate. Use edit_table for table cells. Only use draft_field here if the engineer asked to rewrite or replace the whole field.`;
}

export function redraftTableStructureHint(adding: boolean): string {
  return adding
    ? "Do not rewrite the field to add a table — that strikes the whole section in review. Call edit_table with kind create_table (headers plus rows) at the top of operation, not nested as { create_table: { headers, rows } }. Quote afterAnchor to place it after a specific block, or omit afterAnchor to append before Citations. Surrounding prose stays unmarked."
    : "Do not rewrite the field to remove a table — that strikes the whole section in review. Call edit_table with kind delete_table and tableIndex from read_section. Surrounding prose stays unmarked.";
}
