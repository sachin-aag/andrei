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

/**
 * Solea-style IDs including dotted children (`SW-SST-5.1.1`). The leading
 * family segment may mix letters and digits (`M3-SYS-FN-037`) but must start
 * with a letter, so document numbers such as `825-00024` stay out. Requires a
 * numeric terminal segment so `PASS-FAIL` / `REV-U` / bare `SW-SST-` drop out.
 *
 * The leading segment used to be `[A-Z]{2,}`, which could not match `M3` — so
 * `M3-SYS-FN-037` matched from the second segment and came back as
 * `SYS-FN-037`, silently losing its prefix.
 */
const REQUIREMENT_ID_RE =
  /\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+(?:\.\d+)*\b/g;

const REQUIREMENT_ID_DENY_PREFIX =
  /^(IEC|ISO|CFR|ASTM|ANSI|UL|EN|TABLE|FIG|PAGE|REV)-/i;

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

export function isRequirementId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const ids = requirementIds(trimmed);
  return ids.length === 1 && ids[0] === trimmed;
}

export function normalizeRequirementIds(
  values: readonly string[]
): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    for (const id of requirementIds(value)) {
      seen.add(id);
    }
  }
  return [...seen];
}

export function requirementIds(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(REQUIREMENT_ID_RE)) {
    const id = match[0];
    if (!id || REQUIREMENT_ID_DENY_PREFIX.test(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

const SEGMENT_HAS_LETTER = /[A-Z]/i;

/**
 * Whether an identifier is shaped like a requirement — a candidate row of a
 * Requirements Verified matrix — rather than a controlled part number, system
 * configuration, change order, or manufacturing serial.
 *
 * A requirement carries at least three dash-separated segments and every
 * segment before the terminal number names a family: `SW-SST-5.1.1`,
 * `M3-SYS-FN-037`. Two-segment identifiers (`SUB-00448`, `TOP-00017`,
 * `DCO-02058`) and serials whose middle segment is numeric (`SEN-0724-10001`)
 * are not. `requirementIds` keeps all of those deliberately — retrieval and
 * page outlines want them — so this narrower question is asked separately
 * rather than by widening the deny list.
 */
export function isRequirementRowId(value: string): boolean {
  const id = value.trim();
  if (!isRequirementId(id)) return false;
  const segments = id.split("-");
  if (segments.length < 3) return false;
  return segments
    .slice(0, -1)
    .every((segment) => SEGMENT_HAS_LETTER.test(segment));
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
