import type { DocumentType } from "@/db/schema";
import {
  getDocumentType,
  getSeedableSections,
} from "@/lib/document-types";

/**
 * Default section payloads for reports created without a DOCX upload.
 * Content comes from the document-type registry emptyContent for each
 * seedable (non-virtual) section.
 */
export function seedBlankReportSections(
  documentType: DocumentType = "investigation_report"
): Record<string, unknown> {
  getDocumentType(documentType); // validate
  const content: Record<string, unknown> = {};
  for (const section of getSeedableSections(documentType)) {
    content[section.key] = section.emptyContent;
  }
  return content;
}
