import type { AnalyzeSection } from "@/types/sections";
import type { JSONContent } from "@tiptap/core";
import {
  emptyDoc,
  legacyStringToDoc,
  normalizeRichField,
  richJsonToPlainText,
} from "@/lib/tiptap/rich-text";

/**
 * Store the full 5-Why (chain + conclusion) in `narrative` only; `conclusion` is kept empty for
 * backward compatibility with older payloads (and after merge, DOCX/UI use narrative only).
 */
export function collapseFiveWhyFields(
  fw: AnalyzeSection["fiveWhy"] | undefined | null
): AnalyzeSection["fiveWhy"] {
  if (!fw) {
    return { narrative: emptyDoc(), conclusion: "" };
  }
  const narrativeDoc = normalizeFiveWhyNarrative(fw.narrative);
  const c = (fw.conclusion ?? "").trim();
  if (!c) {
    return { narrative: narrativeDoc, conclusion: "" };
  }
  const base = richJsonToPlainText(narrativeDoc).trimEnd();
  const combined = base ? `${base}\n\n${c}` : c;
  return { narrative: legacyStringToDoc(combined), conclusion: "" };
}

export function normalizeFiveWhyNarrative(value: unknown): JSONContent {
  return normalizeRichField(value);
}

/** Plain text for AI/context — full chain plus any legacy `conclusion` merged in. */
export function fiveWhyTextForExport(
  fw: AnalyzeSection["fiveWhy"] | undefined | null
): string {
  return richJsonToPlainText(collapseFiveWhyFields(fw).narrative);
}
