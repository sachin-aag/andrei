import type { JSONContent } from "@tiptap/core";
import { ELR_SECTION_KEYS } from "@/lib/document-types/elr/sections";
import { canonicalizeSourceCitationBracket } from "@/lib/placeholders/citation-bracket";
import {
  applyGlobalCitationNumbersToContent,
  orderedCitationSourcesFromContent,
} from "@/lib/suggestions/citations-at-end";
import type { ReportSectionRecord } from "@/types/report";

export const ELR_CITATIONS_HEADING = "10.0 CITATIONS";

export type ElrBibliographyEntry = {
  number: number;
  source: string;
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sectionOrderIndex(section: string): number {
  const index = (ELR_SECTION_KEYS as readonly string[]).indexOf(section);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sectionsInDocumentOrder(
  sections: readonly ReportSectionRecord[]
): ReportSectionRecord[] {
  return sections.toSorted(
    (left, right) =>
      sectionOrderIndex(left.section) - sectionOrderIndex(right.section)
  );
}

function sourceKey(source: string): string {
  return canonicalizeSourceCitationBracket(source);
}

/** First-appearance sources across ELR sections, then one global number each. */
export function collectElrBibliography(
  sections: readonly ReportSectionRecord[]
): ElrBibliographyEntry[] {
  const bibliography: ElrBibliographyEntry[] = [];
  const seen = new Set<string>();
  for (const row of sectionsInDocumentOrder(sections)) {
    for (const source of orderedCitationSourcesFromContent(row.content)) {
      const key = sourceKey(source);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      bibliography.push({ number: bibliography.length + 1, source });
    }
  }
  return bibliography;
}

export function elrSourceToGlobalMap(
  bibliography: readonly ElrBibliographyEntry[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { number, source } of bibliography) {
    map.set(source, number);
    map.set(sourceKey(source), number);
  }
  return map;
}

/**
 * Drop per-field Citations lists and rewrite body `[n]` to report-wide numbers.
 * Editor content is unchanged — this is export-only.
 */
export function unifyElrCitationsForExport(
  sections: ReportSectionRecord[]
): { sections: ReportSectionRecord[]; bibliography: ElrBibliographyEntry[] } {
  const bibliography = collectElrBibliography(sections);
  if (bibliography.length === 0) {
    return { sections, bibliography };
  }
  const sourceToGlobal = elrSourceToGlobalMap(bibliography);
  return {
    bibliography,
    sections: sections.map((row) => ({
      ...row,
      content: applyGlobalCitationNumbersToContent(
        row.content,
        sourceToGlobal
      ) as JSONContent | Record<string, unknown>,
    })),
  };
}

function headingParagraphXml(text: string): string {
  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:pStyle w:val="Heading1"/>` +
    `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>` +
    `<w:outlineLvl w:val="0"/>` +
    `</w:pPr>` +
    `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` +
    `</w:p>`
  );
}

function bodyParagraphXml(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/** OOXML for the end-of-report bibliography, or empty when there are no cites. */
export function elrCitationsAppendixXml(
  bibliography: readonly ElrBibliographyEntry[]
): string {
  if (bibliography.length === 0) return "";
  return [
    headingParagraphXml(ELR_CITATIONS_HEADING),
    ...bibliography.map(({ number, source }) =>
      bodyParagraphXml(`${number}. ${source}`)
    ),
  ].join("");
}

/** Insert appendix XML immediately before the document-level `sectPr`. */
export function insertXmlBeforeLastSectPr(
  documentXml: string,
  xml: string
): string {
  if (!xml) return documentXml;
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  if (bodyEnd < 0) return documentXml;
  const beforeBodyEnd = documentXml.slice(0, bodyEnd);
  const sectPrAt = beforeBodyEnd.lastIndexOf("<w:sectPr");
  const insertAt = sectPrAt >= 0 ? sectPrAt : bodyEnd;
  return documentXml.slice(0, insertAt) + xml + documentXml.slice(insertAt);
}
