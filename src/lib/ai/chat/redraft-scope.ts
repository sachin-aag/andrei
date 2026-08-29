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
  | { kind: "targeted_edit"; coverage: number };

/**
 * Classify what a `draft_field` call is really doing to a filled field.
 *
 * A replacement that leaves most of the field intact is a targeted edit
 * written as a whole-field draft. Accepting it would strike the entire field
 * in review even though a few spans changed, so it belongs on `propose_edit`.
 * Adding or removing a table is a structural rewrite regardless of coverage —
 * only `draft_field` can express it.
 */
export function classifyRedraftScope(args: {
  currentText: string;
  nextText: string;
  currentHasTable: boolean;
  nextHasTable: boolean;
}): RedraftScope {
  if (args.currentHasTable !== args.nextHasTable) return { kind: "rewrite" };

  const coverage = redraftDeleteCoverage(args.currentText, args.nextText);
  if (coverage > REDRAFT_COVERAGE_THRESHOLD) return { kind: "rewrite" };
  return { kind: "targeted_edit", coverage };
}

export function redraftTooSmallHint(coverage: number): string {
  const percent = Math.round(coverage * 100);
  return `This replacement keeps ${100 - percent}% of the field — it is a targeted edit, not a rewrite, and draft_field would strike the whole field in review. Call read_section, then make one propose_edit per changed span (several calls are fine). Use edit_table for table cells. Only use draft_field here if the engineer asked to rewrite or replace the whole field.`;
}
