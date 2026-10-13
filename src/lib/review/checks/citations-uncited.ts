import { extractHardFacts } from "@/lib/ai/chat/claim-facts";
import { trailingCitationListStart } from "@/lib/suggestions/citations-at-end";
import {
  flattenForAnchor,
  type AnchorIndex,
} from "@/lib/suggestions/locator";
import { iterReportFields } from "../fields";
import type { ReviewCheckResult, ReviewFindingDraft, ReviewRunContext } from "../types";

/**
 * `stripTrailingCitationBlockFromText` also removes parked `[n]` markers.
 * Uncited-facts must keep those markers (and the Citations list) so
 * `extractHardFacts` can attach the source page. Skip facts that live only
 * in the bibliography itself.
 *
 * Table cells flatten as newline-separated sentences, so a date in
 * Effective Date and `[1]` in Remarks would otherwise miss each other —
 * join the row with spaces and reuse the field's Citations list.
 */
function citedTableRows(fieldText: string, index: AnchorIndex): Set<string> {
  const listStart = trailingCitationListStart(fieldText);
  const bibliography = listStart >= 0 ? fieldText.slice(listStart).trim() : "";
  const cited = new Set<string>();
  const rowKeys = new Set(
    index.cells.map((cell) => `${cell.tableIndex}:${cell.row}`)
  );
  for (const key of rowKeys) {
    const [tableIndex, row] = key.split(":").map(Number);
    const cells = index.cells
      .filter((cell) => cell.tableIndex === tableIndex && cell.row === row)
      .toSorted((a, b) => a.col - b.col);
    const joined = cells
      .map((cell) => index.text.slice(cell.flatStart, cell.flatEnd))
      .join(" ")
      .trim();
    if (!joined) continue;
    const window = bibliography ? `${joined}\n\n${bibliography}` : joined;
    if (extractHardFacts(window).some((fact) => fact.cited.length > 0)) {
      cited.add(key);
    }
  }
  return cited;
}

function cellForOffset(index: AnchorIndex, offset: number) {
  return index.cells.find(
    (cell) => offset >= cell.flatStart && offset < cell.flatEnd
  );
}

export function uncitedFactFindings(
  ctx: Pick<ReviewRunContext, "documentType" | "sections">
): ReviewFindingDraft[] {
  const findings: ReviewFindingDraft[] = [];
  for (const field of iterReportFields(ctx.documentType, ctx.sections)) {
    const listStart = trailingCitationListStart(field.text);
    const index = field.doc ? flattenForAnchor(field.doc) : null;
    const rowCited = index ? citedTableRows(field.text, index) : new Set<string>();
    for (const fact of extractHardFacts(field.text)) {
      if (listStart >= 0 && fact.start >= listStart) continue;
      if (fact.cited.length > 0) continue;
      if (index) {
        const cell = cellForOffset(index, fact.start);
        if (cell && rowCited.has(`${cell.tableIndex}:${cell.row}`)) continue;
      }
      findings.push({
        section: field.section,
        contentPath: field.contentPath,
        anchorText: fact.text,
        message: `Uncited ${fact.kind}: “${fact.text}”. Please add a citation or confirm it is not an attachment fact.`,
        severity: "major",
        kind: "needs_human",
        metadata: { factKind: fact.kind },
      });
    }
  }
  return findings;
}

export async function runUncitedFactsCheck(
  ctx: ReviewRunContext
): Promise<ReviewCheckResult> {
  return { findings: uncitedFactFindings(ctx) };
}
