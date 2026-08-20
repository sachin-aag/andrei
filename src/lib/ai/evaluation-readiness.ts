import type { DocumentType, SectionType } from "@/db/schema";
import { hasExtractedSectionContent } from "@/lib/ai/section-context";
import { getDocumentType } from "@/lib/document-types";

export function insufficientSectionMessage(sectionLabel: string): string {
  return `Fill out the ${sectionLabel} section before running the AI check.`;
}

export const INSUFFICIENT_ANY_SECTION_MESSAGE =
  "Fill out at least one section before running the AI check.";

export const MISSING_COVER_DOCUMENT_NO_MESSAGE =
  "Add a document number on the cover page before running the AI check.";

export function isSectionReadyForEvaluation(args: {
  section: string;
  content: unknown;
  documentNo: string;
}): boolean {
  if (args.section === "cover_page") {
    return Boolean(args.documentNo.trim());
  }
  return hasExtractedSectionContent(args.section as SectionType, args.content);
}

/**
 * Criteria run per filled section. An empty Purpose / Define / cover page
 * must not block evaluation of other sections that already have content.
 */
export function sectionsReadyForEvaluation(args: {
  documentType: DocumentType;
  targets: readonly string[];
  contentFor: (section: string) => unknown;
  documentNo: string;
}): { ready: string[]; error?: string } {
  const ready = args.targets.filter((section) =>
    isSectionReadyForEvaluation({
      section,
      content: args.contentFor(section),
      documentNo: args.documentNo,
    })
  );
  if (ready.length > 0) return { ready };

  if (args.targets.length === 1) {
    const key = args.targets[0]!;
    if (key === "cover_page") {
      return { ready, error: MISSING_COVER_DOCUMENT_NO_MESSAGE };
    }
    const label =
      getDocumentType(args.documentType).sections.find((s) => s.key === key)
        ?.label ?? key;
    return { ready, error: insufficientSectionMessage(label) };
  }

  return { ready, error: INSUFFICIENT_ANY_SECTION_MESSAGE };
}
