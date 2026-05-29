import type { AnalyzeSection } from "@/types/sections";
import { stringFieldFromStoredValue } from "@/lib/section-content-normalize";

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
 * Impact assessment is stored as one free-text field. Legacy payloads used
 * separate System/Document/Product/Equipment/Patient safety slots.
 */
export function collapseImpactAssessment(
  value: unknown,
  fallback = ""
): AnalyzeSection["impactAssessment"] {
  if (typeof value === "string") return value;

  if (!value || typeof value !== "object") return fallback;

  const o = value as LegacyImpactAssessment;
  const parts: string[] = [];

  for (const [key, label] of LEGACY_IMPACT_FIELDS) {
    const text = stringFieldFromStoredValue(o[key]).trim();
    if (!text) continue;
    const prefixed = `${label}: ${text}`;
    if (!parts.includes(prefixed)) parts.push(prefixed);
  }

  return parts.length ? parts.join("\n\n") : fallback;
}

export function impactAssessmentPlainText(value: string | undefined): string {
  return stringFieldFromStoredValue(value).trim();
}
