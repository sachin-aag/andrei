import type { SectionType } from "@/db/schema";
import {
  familyTouchesQuery,
  type SearchQueryPlan,
  planSearchQuery,
} from "@/lib/attachments/search-query";

/**
 * OR-alternatives for one concept. Do not include stems that match
 * unrelated running headers (`fill` / `filling`, `aseptic` / `processing`).
 */
export const MEDIA_FILL_PHRASE_FAMILY = [
  "media fill",
  "mediafill",
  "media-fill",
  "aseptic process simulation",
] as const;

/**
 * Environmental / personnel monitoring results — not URS "monitoring
 * systems" ports and not the bare token `monitoring`.
 */
export const MONITORING_PHRASE_FAMILY = [
  "environmental monitoring",
  "non-viable",
  "non viable",
  "particulate monitoring",
  "viable environmental",
  "viable monitoring",
  "glove monitoring",
  "personnel hygiene",
  "settle plate",
  "active air",
] as const;

const FAMILIES_BY_SECTION: Partial<Record<SectionType, readonly (readonly string[])[]>> =
  {
    elr_media_fill: [MEDIA_FILL_PHRASE_FAMILY],
    elr_monitoring: [MONITORING_PHRASE_FAMILY],
  };

export function phraseFamiliesForSection(
  section: string | null | undefined
): readonly (readonly string[])[] {
  if (!section || section === "all") return [];
  return FAMILIES_BY_SECTION[section as SectionType] ?? [];
}

/**
 * Section key, or a tool objective that names monitoring so a review
 * started as "extract monitoring records" still greps the family.
 */
export function phraseFamiliesForReviewObjective(
  objective: string | null | undefined
): readonly (readonly string[])[] {
  if (!objective) return [];
  const direct = phraseFamiliesForSection(objective);
  if (direct.length > 0) return direct;
  if (/\bmonitoring\b/i.test(objective)) {
    return phraseFamiliesForSection("elr_monitoring");
  }
  return [];
}

export function planDocumentSearchQuery(
  query: string,
  section?: string | null
): SearchQueryPlan {
  const families = phraseFamiliesForSection(section).filter((family) =>
    familyTouchesQuery(query, family)
  );
  return planSearchQuery(query, { families });
}
