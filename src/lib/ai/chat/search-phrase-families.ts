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

const FAMILIES_BY_SECTION: Partial<Record<SectionType, readonly (readonly string[])[]>> =
  {
    elr_media_fill: [MEDIA_FILL_PHRASE_FAMILY],
  };

export function phraseFamiliesForSection(
  section: string | null | undefined
): readonly (readonly string[])[] {
  if (!section || section === "all") return [];
  return FAMILIES_BY_SECTION[section as SectionType] ?? [];
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
