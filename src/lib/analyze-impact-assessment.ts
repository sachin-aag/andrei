import type { JSONContent } from "@tiptap/core";
import type { AnalyzeSection } from "@/types/sections";
import { stringFieldFromStoredValue } from "@/lib/section-content-normalize";
import {
  emptyDoc,
  legacyStringToDoc,
  normalizeRichField,
  richJsonToPlainText,
} from "@/lib/tiptap/rich-text";

const LEGACY_IMPACT_FIELDS = [
  ["system", "System"],
  ["document", "Document"],
  ["product", "Product"],
  ["equipment", "Equipment"],
  ["patientSafety", "Patient safety / Past batches"],
] as const;

type LegacyImpactAssessment = Partial<
  Record<(typeof LEGACY_IMPACT_FIELDS)[number][0], unknown>
>;

/**
 * Impact assessment is stored as one rich field. Legacy payloads used
 * separate System/Document/Product/Equipment/Patient safety slots or plain text.
 */
export function collapseImpactAssessment(
  value: unknown,
  fallback = emptyDoc()
): AnalyzeSection["impactAssessment"] {
  if (typeof value === "string") return legacyStringToDoc(value);

  if (!value || typeof value !== "object") return fallback;

  if (!Array.isArray(value) && (value as JSONContent).type === "doc") {
    return normalizeRichField(value);
  }

  const o = value as LegacyImpactAssessment;
  const parts: string[] = [];

  for (const [key, label] of LEGACY_IMPACT_FIELDS) {
    const text = stringFieldFromStoredValue(o[key]).trim();
    if (!text) continue;
    const prefixed = `${label}: ${text}`;
    if (!parts.includes(prefixed)) parts.push(prefixed);
  }

  return parts.length ? legacyStringToDoc(parts.join("\n\n")) : fallback;
}

export function impactAssessmentPlainText(value: JSONContent | undefined): string {
  return richJsonToPlainText(value ? normalizeRichField(value) : emptyDoc()).trim();
}
