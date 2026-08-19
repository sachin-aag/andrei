import { MIN_TEXT_LAYER_CHARS } from "@/lib/attachments/pdf-text-layer";

export const OCR_CHAR_RATIO_MIN = 0.45;
export const OCR_CHAR_RATIO_MAX = 2.2;
export const OCR_ID_RECALL_MIN = 0.7;
export const OCR_MEAN_CONFIDENCE_MIN = 0.6;
export const OCR_LATENCY_GATE_MS = 120_000;
/** Timed Gemini soak of Appendix B on 2026-08-18 (transcripts discarded). */
export const GEMINI_APPENDIX_B_BASELINE_MS = 743_211;
export const OCR_QUALITY_PAGES = [1, 4, 31, 37, 59] as const;
export const REQUIREMENT_ID_RECALL_PAGE = 31;

const REQUIREMENT_ID_RE = /\b[A-Z]{2,}-[A-Z0-9-]+\b/g;

export function charRatio(ocrText: string, geminiText: string): number | null {
  if (geminiText.length === 0) return ocrText.length === 0 ? 1 : null;
  return ocrText.length / geminiText.length;
}

export function charRatioInBallpark(
  ocrText: string,
  geminiText: string
): boolean {
  const ratio = charRatio(ocrText, geminiText);
  if (ratio == null) return false;
  return ratio >= OCR_CHAR_RATIO_MIN && ratio <= OCR_CHAR_RATIO_MAX;
}

/**
 * Heuristic for failed rotation: a column of single characters, or a long
 * string with almost no spaces.
 */
export function sidewaysLikely(text: string): boolean {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 8) {
    const singleChar = lines.filter((line) => line.length === 1).length;
    if (singleChar / lines.length > 0.4) return true;
  }
  const letters = text.replace(/\s/g, "");
  if (letters.length > 80) {
    const spaces = (text.match(/\s/g) ?? []).length;
    if (spaces / letters.length < 0.05) return true;
  }
  return false;
}

export function requirementIds(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(REQUIREMENT_ID_RE)) {
    const id = match[0];
    if (id) seen.add(id);
  }
  return [...seen];
}

export function idRecall(ocrText: string, geminiText: string): number | null {
  const geminiIds = requirementIds(geminiText);
  if (geminiIds.length === 0) return null;
  const ocrIds = new Set(requirementIds(ocrText));
  const hit = geminiIds.filter((id) => ocrIds.has(id)).length;
  return hit / geminiIds.length;
}

export function isWeakOcrTranscript(
  transcript: string,
  confidence: number | null
): boolean {
  const trimmed = transcript.trim();
  if (trimmed.length < MIN_TEXT_LAYER_CHARS) return true;
  if (confidence != null && confidence < OCR_MEAN_CONFIDENCE_MIN) return true;
  const alphanumerics = trimmed.replace(/[^A-Za-z0-9]/g, "");
  if (alphanumerics.length < 20) return true;
  return false;
}

export type QualityPageMetrics = {
  pageNumber: number;
  ocrChars: number;
  geminiChars: number;
  charRatio: number | null;
  charRatioInBallpark: boolean;
  sidewaysLikely: boolean;
  weak: boolean;
  idRecall: number | null;
};

export function scoreQualityPage(input: {
  pageNumber: number;
  ocrText: string;
  ocrConfidence: number | null;
  geminiText: string;
}): QualityPageMetrics {
  return {
    pageNumber: input.pageNumber,
    ocrChars: input.ocrText.length,
    geminiChars: input.geminiText.length,
    charRatio: charRatio(input.ocrText, input.geminiText),
    charRatioInBallpark: charRatioInBallpark(input.ocrText, input.geminiText),
    sidewaysLikely: sidewaysLikely(input.ocrText),
    weak: isWeakOcrTranscript(input.ocrText, input.ocrConfidence),
    idRecall:
      input.pageNumber === REQUIREMENT_ID_RECALL_PAGE
        ? idRecall(input.ocrText, input.geminiText)
        : null,
  };
}

export type CompareGate = {
  pass: boolean;
  reasons: string[];
  latencyPass: boolean;
  qualityPagesInBallpark: number;
  idRecallPass: boolean;
};

export function evaluateCompareGate(input: {
  ocrElapsedMs: number;
  pages: QualityPageMetrics[];
}): CompareGate {
  const reasons: string[] = [];
  const latencyPass = input.ocrElapsedMs < OCR_LATENCY_GATE_MS;
  if (!latencyPass) {
    reasons.push(
      `OCR wall clock ${input.ocrElapsedMs}ms is at or above ${OCR_LATENCY_GATE_MS}ms`
    );
  }

  const inBallpark = input.pages.filter(
    (page) => page.charRatioInBallpark && !page.sidewaysLikely
  ).length;
  if (inBallpark < 4) {
    reasons.push(
      `Only ${inBallpark} of ${input.pages.length} quality pages are in char-ratio ballpark and not sideways`
    );
  }

  const page31 = input.pages.find(
    (page) => page.pageNumber === REQUIREMENT_ID_RECALL_PAGE
  );
  let idRecallPass = true;
  if (page31?.idRecall == null) {
    reasons.push(
      `Page ${REQUIREMENT_ID_RECALL_PAGE} has no Gemini requirement-like IDs; confirm OCR against the PDF before wiring`
    );
    idRecallPass = false;
  } else if (page31.idRecall < OCR_ID_RECALL_MIN) {
    reasons.push(
      `Page ${REQUIREMENT_ID_RECALL_PAGE} idRecall ${page31.idRecall.toFixed(2)} is below ${OCR_ID_RECALL_MIN}`
    );
    idRecallPass = false;
  }

  return {
    pass: latencyPass && inBallpark >= 4 && idRecallPass,
    reasons,
    latencyPass,
    qualityPagesInBallpark: inBallpark,
    idRecallPass,
  };
}
