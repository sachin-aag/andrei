import type { SectionType } from "@/db/schema";
import {
  inventoryPhraseFamilyForSection,
  inventorySectionForObjective,
} from "@/lib/ai/chat/inventory-review-schema";
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

const STEM_FAMILIES_BY_SECTION: Partial<
  Record<SectionType, readonly (readonly string[])[]>
> = {
  elr_media_fill: [MEDIA_FILL_PHRASE_FAMILY],
};

export function phraseFamiliesForSection(
  section: string | null | undefined
): readonly (readonly string[])[] {
  if (!section || section === "all") return [];
  const stemming = STEM_FAMILIES_BY_SECTION[section as SectionType] ?? [];
  const schemaFamily = inventoryPhraseFamilyForSection(section);
  if (schemaFamily.length === 0) return stemming;
  return [...stemming, schemaFamily];
}

/**
 * Section key, or a tool objective that names an inventory table so a
 * review started as "extract monitoring records" still greps that
 * table's column phrases.
 */
export function phraseFamiliesForReviewObjective(
  objective: string | null | undefined
): readonly (readonly string[])[] {
  if (!objective) return [];
  const direct = phraseFamiliesForSection(objective);
  if (direct.length > 0) return direct;
  const mapped = inventorySectionForObjective(objective);
  if (mapped) return phraseFamiliesForSection(mapped);
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
