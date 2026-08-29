import type { DocumentType, SectionType } from "@/db/schema";
import { getDocumentType } from "@/lib/document-types";

/** Best-effort section intent from the user's message (null if unclear). */
export function detectSectionIntentFromText(
  text: string,
  documentType: DocumentType = "investigation_report"
): SectionType | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const patterns = getDocumentType(documentType).chat.sectionIntentPatterns;
  let match: { section: SectionType; count: number } | null = null;
  for (const [section, sectionPatterns] of patterns) {
    const count = sectionPatterns.reduce(
      (total, pattern) => total + Number(pattern.test(trimmed)),
      0
    );
    if (count > 0 && (!match || count > match.count)) {
      match = { section, count };
    }
  }
  return match?.section ?? null;
}
