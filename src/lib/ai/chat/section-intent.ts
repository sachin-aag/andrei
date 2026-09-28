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

const OUTLINE_NUMBER_LIST_RE =
  /\b(?:draft|fill|populate|complete|sections?|tables?)\b[\s\w,]{0,48}?(\d+(?:\.\d+)?(?:\s*(?:,|&|and)\s*(?:and\s+)?\d+(?:\.\d+)?)+)/gi;

function outlineNumberFromLabel(label: string): string | null {
  const match = label.trim().match(/^(\d+(?:\.\d+)*)\b/);
  return match?.[1] ?? null;
}

function outlineNumberMatches(userNum: string, labelNum: string): boolean {
  if (userNum === labelNum) return true;
  return !userNum.includes(".") && labelNum.startsWith(`${userNum}.`);
}

/** "draft 2,3,4" / "tables 3 and 4" → Contents numbers in mention order. */
function listedOutlineNumbers(
  text: string
): Array<{ number: string; index: number }> {
  const found: Array<{ number: string; index: number }> = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(OUTLINE_NUMBER_LIST_RE)) {
    const blob = match[1] ?? "";
    const full = match[0] ?? "";
    const blobIndex = (match.index ?? 0) + Math.max(0, full.indexOf(blob));
    let cursor = 0;
    for (const part of blob.split(/\s*(?:,|&|and)\s*/i)) {
      const n = part.trim();
      if (!/^\d+(?:\.\d+)?$/.test(n)) continue;
      const local = blob.indexOf(n, cursor);
      const index = blobIndex + (local >= 0 ? local : 0);
      cursor = (local >= 0 ? local : cursor) + n.length;
      if (seen.has(n)) continue;
      seen.add(n);
      found.push({ number: n, index });
    }
  }
  return found;
}

function sectionHitsFromText(
  text: string,
  documentType: DocumentType
): SectionHit[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const def = getDocumentType(documentType);
  const patterns = def.chat.sectionIntentPatterns;
  const hits: SectionHit[] = [];
  const bySection = new Map<SectionType, SectionHit>();
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
      const hit = { section, count, earliest };
      hits.push(hit);
      bySection.set(section, hit);
    }
  }

  for (const listed of listedOutlineNumbers(trimmed)) {
    for (const section of def.sections) {
      if (!section.editable || section.virtual) continue;
      const labelNum = outlineNumberFromLabel(section.label);
      if (!labelNum || !outlineNumberMatches(listed.number, labelNum)) {
        continue;
      }
      const existing = bySection.get(section.key);
      if (existing) {
        existing.count += 1;
        if (listed.index < existing.earliest) existing.earliest = listed.index;
        continue;
      }
      const hit = {
        section: section.key,
        count: 1,
        earliest: listed.index,
      };
      hits.push(hit);
      bySection.set(section.key, hit);
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
