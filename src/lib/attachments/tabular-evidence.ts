import { requirementIds } from "@/lib/attachments/ocr-quality";
import { textLayerDroppedCelsiusSign } from "@/lib/attachments/numeric-signs";

/**
 * Large text-layer batches skip a bulk insight pass. This is how many of the
 * strongest table-like pages still get a targeted Gemini look.
 */
export const MAX_TABULAR_INSIGHT_PAGES = 5;

/** Inclusive; filler prose and a single SOP citation stay below this. */
export const TABULAR_EVIDENCE_MIN_SCORE = 6;

const QUANTITY_UNIT_RE =
  /\d+(?:\.\d+)?\s*(?:°\s*C|kg\s*\/\s*cm|mm\b|rpm\b|mbar\b|\bbar\b|%rh|vac(?:uum)?)/gi;

const TABLE_HEADER_RE =
  /\b(parameters?|acceptance criteria|specification|user requirement|operating (?:temperature|pressure)|traceability)\b/i;

export type TabularEvidencePage = {
  pageNumber: number;
  text: string;
};

export function tabularEvidenceScore(text: string): number {
  const ids = requirementIds(text).length;
  const idScore = Math.min(ids, 10) * 3;
  const unitScore = Math.min(countQuantityUnits(text), 8);
  const droppedSignScore = textLayerDroppedCelsiusSign(text) ? 4 : 0;
  const densityScore = shortLineDensityScore(text);
  const headerScore = TABLE_HEADER_RE.test(text) ? 2 : 0;
  return idScore + unitScore + droppedSignScore + densityScore + headerScore;
}

export function pageLooksLikeTabularEvidence(text: string): boolean {
  return tabularEvidenceScore(text) >= TABULAR_EVIDENCE_MIN_SCORE;
}

/**
 * Highest-scoring table-like pages, capped so a 15-page protocol does not
 * become a bulk insight wave. Stable order is document page number.
 */
export function selectTabularEvidencePages(
  pages: readonly TabularEvidencePage[],
  limit = MAX_TABULAR_INSIGHT_PAGES
): TabularEvidencePage[] {
  const ranked = pages
    .map((page) => ({ page, score: tabularEvidenceScore(page.text) }))
    .filter((entry) => entry.score >= TABULAR_EVIDENCE_MIN_SCORE)
    .toSorted(
      (left, right) =>
        right.score - left.score || left.page.pageNumber - right.page.pageNumber
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.page);
  return ranked.toSorted((left, right) => left.pageNumber - right.pageNumber);
}

function countQuantityUnits(text: string): number {
  return text.match(QUANTITY_UNIT_RE)?.length ?? 0;
}

function shortLineDensityScore(text: string): number {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 8) return 0;
  const short = lines.filter((line) => line.length <= 60).length;
  return short / lines.length >= 0.65 ? 3 : 0;
}
