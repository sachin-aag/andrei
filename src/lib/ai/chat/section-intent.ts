import type { DocumentType, SectionType } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";

type SectionHit = {
  section: SectionType;
  count: number;
  earliest: number;
};

function firstMatchIndex(text: string, pattern: RegExp): number {
  const flags = pattern.flags.replaceAll("g", "");
  const copy = new RegExp(pattern.source, flags);
  const match = copy.exec(text);
  return match?.index ?? -1;
}

function sectionHitsFromText(
  text: string,
  documentType: DocumentType
): SectionHit[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const patterns = getDocumentType(documentType).chat.sectionIntentPatterns;
  const hits: SectionHit[] = [];
  for (const [section, sectionPatterns] of patterns) {
    let count = 0;
    let earliest = Number.POSITIVE_INFINITY;
    for (const pattern of sectionPatterns) {
      const index = firstMatchIndex(trimmed, pattern);
      if (index < 0) continue;
      count += 1;
      if (index < earliest) earliest = index;
    }
    if (count > 0) {
      hits.push({ section, count, earliest });
    }
  }
  return hits;
}

/** Best-effort section intent from the user's message (null if unclear). */
export function detectSectionIntentFromText(
  text: string,
  documentType: DocumentType = "investigation_report"
): SectionType | null {
  const hits = sectionHitsFromText(text, documentType);
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.count - a.count || a.earliest - b.earliest);
  return hits[0]?.section ?? null;
}

/**
 * Every section named in the message, in first-mention order. Used to seed a
 * remaining-section queue for "draft 5.2, 5.3, 5.4" without filling the rest
 * of the report.
 */
export function detectSectionIntentsFromText(
  text: string,
  documentType: DocumentType = "investigation_report"
): SectionType[] {
  return sectionHitsFromText(text, documentType)
    .toSorted((a, b) => a.earliest - b.earliest)
    .map((hit) => hit.section);
}
