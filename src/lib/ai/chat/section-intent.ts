import type { DocumentType, SectionType } from "@/db/schema";
import { type ChatSectionScope, sectionLabel } from "@/lib/ai/chat/fields";
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

export type SectionScopeMismatch = {
  suggestedSection: SectionType;
  currentSection: SectionType;
  reason: string;
};

/** When a single section is selected, detect if the user message targets another. */
export function detectSectionScopeMismatch(
  currentScope: ChatSectionScope,
  userText: string,
  documentType: DocumentType = "investigation_report"
): SectionScopeMismatch | null {
  if (currentScope === "all") return null;

  const intent = detectSectionIntentFromText(userText, documentType);
  if (!intent || intent === currentScope) return null;

  return {
    suggestedSection: intent,
    currentSection: currentScope,
    reason: `This looks like a question about ${sectionLabel(intent)}, not ${sectionLabel(currentScope)}.`,
  };
}
