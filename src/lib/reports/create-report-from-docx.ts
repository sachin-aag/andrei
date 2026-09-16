import type { JSONContent } from "@tiptap/core";
import type { DocumentType, InvestigationReportMetadata } from "@/db/schema";
import { GENERIC_DOCUMENT_SECTION } from "@/lib/document-types/generic/sections";
import { getSeedableSections } from "@/lib/document-types";
import type { ImportedReportContent } from "@/lib/import/docx-to-sections";
import { seedBlankReportSections } from "@/lib/reports/seed-blank-report-sections";
import { EMPTY_CONTENT, type SectionContentMap } from "@/types/sections";

function isImportedSectionKey(key: string): key is keyof SectionContentMap {
  return Object.prototype.hasOwnProperty.call(EMPTY_CONTENT, key);
}

export function investigationMetadataFromImport(
  imported: ImportedReportContent
): InvestigationReportMetadata {
  return {
    toolsUsed: imported.toolsUsed,
    otherTools: imported.header.otherTools?.trim() ?? "",
  };
}

export function sectionRowsForCreate(
  documentType: DocumentType,
  imported: ImportedReportContent | null,
  genericBody?: { narrative: JSONContent } | null
): { section: string; content: Record<string, unknown> }[] {
  const blank = seedBlankReportSections(documentType);
  return getSeedableSections(documentType).map((section) => {
    if (
      genericBody &&
      section.key === GENERIC_DOCUMENT_SECTION
    ) {
      return {
        section: section.key,
        content: { narrative: genericBody.narrative },
      };
    }
    const importedContent =
      imported && isImportedSectionKey(section.key)
        ? imported.sections[section.key]
        : undefined;
    return {
      section: section.key,
      content: (importedContent ?? blank[section.key] ?? {}) as Record<
        string,
        unknown
      >,
    };
  });
}

/**
 * Section keys that should get an audit version snapshot at create time.
 * Blank templates (including ELR's 22 seeded tables) are not snapshotted —
 * each snapshot is three sequential DB round-trips through the audit hash
 * chain (`SELECT … FOR UPDATE`) on a production pool of max 1, which can
 * stall create until the serverless timeout. Imported Word content is real
 * history and still gets a snapshot. First human/Agent edit of a blank
 * section becomes v1.
 */
export function sectionKeysToSnapshotOnCreate(
  imported: ImportedReportContent | null,
  genericBody?: { narrative: JSONContent } | null
): ReadonlySet<string> {
  const keys = new Set<string>();
  if (genericBody) {
    keys.add(GENERIC_DOCUMENT_SECTION);
  }
  if (!imported) return keys;
  for (const key of Object.keys(imported.sections)) {
    if (isImportedSectionKey(key)) keys.add(key);
  }
  return keys;
}
