import type { JSONContent } from "@tiptap/core";
import { citationDisplayFilename } from "@/lib/citations/citation-filename";
import { ELR_SECTION_KEYS } from "@/lib/document-types/elr/sections";
import {
  canonicalizeSourceCitationBracket,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";
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

function sectionOrderIndex(section: string, sectionKeys: readonly string[]): number {
  const index = sectionKeys.indexOf(section);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sectionsInDocumentOrder(
  sections: readonly ReportSectionRecord[],
  sectionKeys: readonly string[]
): ReportSectionRecord[] {
  return sections.toSorted(
    (left, right) =>
      sectionOrderIndex(left.section, sectionKeys) -
      sectionOrderIndex(right.section, sectionKeys)
  );
}

function basenameLower(filename: string): string {
  return citationDisplayFilename(filename)
    .replace(/^.*[/\\]/, "")
    .trim()
    .toLowerCase();
}

/** Written page list so `p. 4` and `p.4` match; ranges stay `1-3`. */
function pageIdentityFromSource(source: string): string {
  const inner = source.trim().replace(/^\[/, "").replace(/\]$/, "");
  const suffix = /,\s*p\.\s*(.+)$/i.exec(inner);
  if (!suffix) return "";
  return suffix[1]
    .replace(/\s*,\s*p\.\s*/gi, ",")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Same attached file + same page list. Ignores case, download stamps, and
 * spacing around `p.`. Different pages of one file stay distinct.
 */
export function citationSourceIdentityKey(source: string): string {
  const canonical = canonicalizeSourceCitationBracket(source);
  const parsed = parseSourceCitation(canonical);
  if (!parsed?.filename.trim()) {
    return canonical.trim().toLowerCase();
  }
  return `${basenameLower(parsed.filename)}\0${pageIdentityFromSource(canonical)}`;
}

export type ReportBibliographyIdentity = (source: string) => string;

export type ReportBibliographyMergeSources = (
  kept: string,
  incoming: string
) => string;

/** First-appearance sources across sections, then one global number each. */
export function collectReportBibliography(
  sections: readonly ReportSectionRecord[],
  sectionKeys: readonly string[],
  sourceIdentity: ReportBibliographyIdentity = citationSourceIdentityKey,
  mergeSources?: ReportBibliographyMergeSources
): ElrBibliographyEntry[] {
  const bibliography: ElrBibliographyEntry[] = [];
  const indexByKey = new Map<string, number>();
  for (const row of sectionsInDocumentOrder(sections, sectionKeys)) {
    for (const source of orderedCitationSourcesFromContent(row.content)) {
      const key = sourceIdentity(source);
      if (!key) continue;
      const existing = indexByKey.get(key);
      if (existing != null) {
        if (mergeSources) {
          const entry = bibliography[existing]!;
          entry.source = mergeSources(entry.source, source);
        }
        continue;
      }
      indexByKey.set(key, bibliography.length);
      bibliography.push({ number: bibliography.length + 1, source });
    }
  }
  return bibliography;
}

/** First-appearance sources across ELR sections, then one global number each. */
export function collectElrBibliography(
  sections: readonly ReportSectionRecord[]
): ElrBibliographyEntry[] {
  return collectReportBibliography(sections, ELR_SECTION_KEYS);
}

export function elrSourceToGlobalMap(
  bibliography: readonly ElrBibliographyEntry[],
  sourceIdentity: ReportBibliographyIdentity = citationSourceIdentityKey
): Map<string, number> {
  const map = new Map<string, number>();
  for (const { number, source } of bibliography) {
    map.set(source, number);
    map.set(canonicalizeSourceCitationBracket(source), number);
    map.set(sourceIdentity(source), number);
  }
  return map;
}

function reportSourceToGlobalMap(
  sections: readonly ReportSectionRecord[],
  sectionKeys: readonly string[],
  bibliography: readonly ElrBibliographyEntry[],
  sourceIdentity: ReportBibliographyIdentity
): Map<string, number> {
  const byIdentity = new Map<string, number>();
  for (const { number, source } of bibliography) {
    byIdentity.set(sourceIdentity(source), number);
  }
  const map = elrSourceToGlobalMap(bibliography, sourceIdentity);
  const remember = (source: string, number: number) => {
    map.set(source, number);
    map.set(canonicalizeSourceCitationBracket(source), number);
    map.set(sourceIdentity(source), number);
  };
  for (const row of sectionsInDocumentOrder(sections, sectionKeys)) {
    for (const source of orderedCitationSourcesFromContent(row.content)) {
      const number = byIdentity.get(sourceIdentity(source));
      if (number == null) continue;
      remember(source, number);
    }
  }
  return map;
}

/**
 * Drop per-field Citations lists and rewrite body `[n]` to report-wide numbers.
 * Editor content is unchanged — this is export-only.
 */
export function unifyReportCitationsForExport(
  sections: ReportSectionRecord[],
  sectionKeys: readonly string[],
  options?: {
    sourceIdentity?: ReportBibliographyIdentity;
    mergeSources?: ReportBibliographyMergeSources;
  }
): { sections: ReportSectionRecord[]; bibliography: ElrBibliographyEntry[] } {
  const sourceIdentity = options?.sourceIdentity ?? citationSourceIdentityKey;
  const bibliography = collectReportBibliography(
    sections,
    sectionKeys,
    sourceIdentity,
    options?.mergeSources
  );
  if (bibliography.length === 0) {
    return { sections, bibliography };
  }
  const sourceToGlobal = reportSourceToGlobalMap(
    sections,
    sectionKeys,
    bibliography,
    sourceIdentity
  );
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

export function unifyElrCitationsForExport(
  sections: ReportSectionRecord[]
): { sections: ReportSectionRecord[]; bibliography: ElrBibliographyEntry[] } {
  return unifyReportCitationsForExport(sections, ELR_SECTION_KEYS);
}

export function citationsHeadingParagraphXml(text: string): string {
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
export function citationsAppendixXml(
  bibliography: readonly ElrBibliographyEntry[],
  heading: string
): string {
  if (bibliography.length === 0) return "";
  return [
    citationsHeadingParagraphXml(heading),
    ...bibliography.map(({ number, source }) =>
      bodyParagraphXml(`${number}. ${source}`)
    ),
  ].join("");
}

export function elrCitationsAppendixXml(
  bibliography: readonly ElrBibliographyEntry[]
): string {
  return citationsAppendixXml(bibliography, ELR_CITATIONS_HEADING);
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
