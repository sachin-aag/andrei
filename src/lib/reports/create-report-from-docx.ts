import type { DocumentType, InvestigationReportMetadata } from "@/db/schema";
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
  imported: ImportedReportContent | null
): { section: string; content: Record<string, unknown> }[] {
  const blank = seedBlankReportSections(documentType);
  return getSeedableSections(documentType).map((section) => {
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
