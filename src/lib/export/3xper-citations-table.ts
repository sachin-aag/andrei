import type { JSONContent } from "@tiptap/core";
import { citationDisplayFilename } from "@/lib/citations/citation-filename";
import {
  QSR_DOCX_RUN_STYLE,
  createDocxExportContext,
  type DocxRunStyle,
} from "@/lib/export/docx-export-context";
import {
  citationSourceIdentityKey,
  citationsHeadingParagraphXml,
  type ElrBibliographyEntry,
} from "@/lib/export/elr-unified-citations";
import { narrativeToDocxXml } from "@/lib/export/narrative-to-docx-xml";
import { parseSourceCitation } from "@/lib/placeholders/citation-bracket";
import type { ReportSectionRecord } from "@/types/report";

export const THREE_XPER_CITATIONS_HEADING = "CITATIONS";

export const THREE_XPER_CITATION_HEADERS = [
  "Citation #",
  "Document reference #",
  "Description of Document",
  "Reference page#",
] as const;

/** Grey banners on the VQ paper form, not QSR gold. */
const VQ_CITATIONS_RUN_STYLE: DocxRunStyle = {
  font: "Times New Roman",
  sizeHalfPoints: "24",
  forceBlackText: true,
  tableHeaderFill: "D9D9D9",
  paragraphAlign: "left",
  listParagraphStyle: true,
  tableKeepTogetherWrapper: false,
  tableWidthPct: "5000",
  tableBorderColor: "000000",
  tableHeaderAlign: "center",
};

const QSR_CITATIONS_RUN_STYLE: DocxRunStyle = {
  ...QSR_DOCX_RUN_STYLE,
  paragraphAlign: "left",
  tableHeaderAlign: "center",
};

const QSR_CATALOG_SECTIONS = [
  "qsr_qualification_documents",
  "qsr_references",
  "qsr_sops",
] as const;

/** Name column 0, number column 1 on each catalog table. */
const CATALOG_NAME_COL = 0;
const CATALOG_NUMBER_COL = 1;

const FILE_EXTENSION = /\.(?:pdf|docx|csv|xlsx)$/i;

/**
 * Qualification-family labels ↔ abbreviations so a cite named
 * `User Requirement Specification.PDF` can pick up `URS/PB2/…` from Table 3.
 */
const DOCUMENT_FAMILY: ReadonlyArray<{
  abbr: string;
  names: readonly string[];
}> = [
  { abbr: "urs", names: ["user requirement specification"] },
  { abbr: "dq", names: ["design qualification"] },
  { abbr: "iq", names: ["installation qualification"] },
  { abbr: "oq", names: ["operational qualification", "operation qualification"] },
  { abbr: "pq", names: ["performance qualification"] },
  { abbr: "ds", names: ["design specification", "data sheet"] },
  { abbr: "fat", names: ["factory acceptance test"] },
  { abbr: "sat", names: ["site acceptance test"] },
  { abbr: "fmea", names: ["failure mode"] },
];

/** Slash- or hyphen-separated exhibit ids (`URS/PB2/001`, `DQ-PB2-14`). */
const DOCUMENT_ID_STEM =
  /^(?:[A-Z]{1,8}(?:[/_-][A-Z0-9]+)+|\d{3,}-\d{4,}[A-Z0-9._-]*)$/i;

export type ThreeXperCitationRow = {
  citationNumber: string;
  documentReference: string;
  description: string;
  referencePage: string;
};

export type QsrDocumentCatalogEntry = {
  name: string;
  number: string;
};

function nodeText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map((child) => nodeText(child)).join("");
}

function normalizeLabel(value: string): string {
  return value
    .replace(FILE_EXTENSION, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isUsableDocumentNumber(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^<[^>]+>$/.test(trimmed)) return false;
  if (/^x+$/i.test(trimmed)) return false;
  if (/to be filled/i.test(trimmed)) return false;
  return true;
}

function familyKeys(label: string): Set<string> {
  const normalized = normalizeLabel(label);
  const keys = new Set<string>();
  if (normalized) keys.add(normalized);
  for (const { abbr, names } of DOCUMENT_FAMILY) {
    const inFamily =
      normalized === abbr ||
      normalized.startsWith(`${abbr} `) ||
      normalized.startsWith(`${abbr}/`) ||
      normalized.startsWith(`${abbr}-`) ||
      names.some(
        (name) => normalized === name || normalized.startsWith(`${name} `)
      );
    if (!inFamily) continue;
    keys.add(abbr);
    for (const name of names) keys.add(name);
  }
  return keys;
}

function labelsMatch(left: string, right: string): boolean {
  const a = familyKeys(left);
  const b = familyKeys(right);
  for (const key of a) {
    if (b.has(key)) return true;
  }
  for (const key of a) {
    if (key.length < 12) continue;
    for (const other of b) {
      if (other.includes(key) || (other.length >= 12 && key.includes(other))) {
        return true;
      }
    }
  }
  return false;
}

function findTableNode(value: unknown): JSONContent | null {
  if (!value || typeof value !== "object") return null;
  const node = value as JSONContent;
  if (node.type === "table") return node;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTableNode(item);
      if (found) return found;
    }
    return null;
  }
  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findTableNode(nested);
    if (found) return found;
  }
  return null;
}

function tableGrid(table: JSONContent): string[][] {
  const rows: string[][] = [];
  for (const row of table.content ?? []) {
    if (row.type !== "tableRow") continue;
    const cells = (row.content ?? []).filter(
      (cell) => cell.type === "tableCell" || cell.type === "tableHeader"
    );
    const colspan = (cell: JSONContent): number => {
      const raw = cell.attrs?.colspan;
      return typeof raw === "number" && Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : 1;
    };
    if (cells.length === 1 && colspan(cells[0]!) > 1) continue;
    rows.push(cells.map((cell) => nodeText(cell).replace(/\s+/g, " ").trim()));
  }
  return rows;
}

function isHeaderRow(row: readonly string[]): boolean {
  const first = normalizeLabel(row[CATALOG_NAME_COL] ?? "");
  return (
    first === "document name" ||
    first === "name of the document" ||
    first === "sop name"
  );
}

/**
 * Document name → number pairs from QSR Table 3, 1.3 References, and SOPs.
 * A blank name under a filled number continues the protocol row above.
 */
export function qsrDocumentReferenceCatalog(
  sections: readonly ReportSectionRecord[]
): QsrDocumentCatalogEntry[] {
  const catalog: QsrDocumentCatalogEntry[] = [];
  const seen = new Set<string>();
  for (const row of sections) {
    if (
      !QSR_CATALOG_SECTIONS.includes(
        row.section as (typeof QSR_CATALOG_SECTIONS)[number]
      )
    ) {
      continue;
    }
    const table = findTableNode(row.content);
    if (!table) continue;
    let lastName = "";
    for (const cells of tableGrid(table)) {
      if (isHeaderRow(cells)) continue;
      const rawName = (cells[CATALOG_NAME_COL] ?? "").trim();
      const number = (cells[CATALOG_NUMBER_COL] ?? "").trim();
      if (rawName) lastName = rawName;
      const name = rawName || lastName;
      if (!name || !isUsableDocumentNumber(number)) continue;
      const key = `${normalizeLabel(name)}\0${compactId(number)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalog.push({ name, number });
    }
  }
  return catalog;
}

function descriptionFromFilename(filename: string): string {
  const display = citationDisplayFilename(filename);
  if (FILE_EXTENSION.test(display)) {
    return display.replace(FILE_EXTENSION, "");
  }
  return display;
}

function documentNumberFromFilename(filename: string): string {
  const stem = descriptionFromFilename(filename).trim();
  if (!DOCUMENT_ID_STEM.test(stem)) return "";
  return stem;
}

function expandedFamilyDescription(stem: string): string | null {
  const normalized = normalizeLabel(stem);
  for (const { abbr, names } of DOCUMENT_FAMILY) {
    if (normalized === abbr || normalized.startsWith(`${abbr} `) || compactId(stem).startsWith(abbr)) {
      const phrase = names[0];
      if (!phrase) return null;
      return phrase.replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }
  return null;
}

function lookupDocumentNumber(
  filename: string,
  description: string,
  catalog: readonly QsrDocumentCatalogEntry[]
): string {
  const stem = descriptionFromFilename(filename);
  const stemId = compactId(stem);
  for (const entry of catalog) {
    if (stemId && compactId(entry.number) === stemId) return entry.number;
  }
  for (const entry of catalog) {
    if (labelsMatch(description, entry.name) || labelsMatch(stem, entry.name)) {
      return entry.number;
    }
  }
  return documentNumberFromFilename(filename);
}

function pageLabelFromSource(source: string): string {
  const parsed = parseSourceCitation(source);
  if (!parsed || parsed.pages.length === 0) return "";
  const inner = source.trim().replace(/^\[/, "").replace(/\]$/, "");
  const suffix = /,\s*p\.\s*(.+)$/i.exec(inner);
  if (!suffix) return `Page # ${parsed.pages[0]}`;
  const pages = suffix[1]
    .replace(/\s*,\s*p\.\s*/gi, ", ")
    .replace(/\s+/g, " ")
    .trim();
  return pages ? `Page # ${pages}` : `Page # ${parsed.pages[0]}`;
}

/**
 * Collapse equivalent 3xper cites: same catalog document number + page, or
 * the same description + page when there is no number. Falls back to file +
 * page so VQ rows without a catalog still dedupe.
 */
export function threeXperCitationIdentityKey(
  source: string,
  sections: readonly ReportSectionRecord[] = []
): string {
  const [row] = threeXperCitationRows([{ number: 1, source }], sections);
  const page = (row?.referencePage ?? "").trim().toLowerCase();
  const ref = row?.documentReference.trim() ?? "";
  if (ref) return `ref:${compactId(ref)}\0${page}`;
  const description = normalizeLabel(row?.description ?? "");
  if (description) return `desc:${description}\0${page}`;
  return citationSourceIdentityKey(source);
}

export function threeXperCitationRows(
  bibliography: readonly ElrBibliographyEntry[],
  sections: readonly ReportSectionRecord[] = []
): ThreeXperCitationRow[] {
  const catalog = qsrDocumentReferenceCatalog(sections);
  return bibliography.map((entry) => {
    const parsed = parseSourceCitation(entry.source);
    const filename = parsed?.filename?.trim() || entry.source;
    let description = descriptionFromFilename(filename);
    const documentReference = lookupDocumentNumber(
      filename,
      description,
      catalog
    );
    if (
      documentReference &&
      normalizeLabel(description) === normalizeLabel(documentReference)
    ) {
      description = expandedFamilyDescription(description) ?? description;
    }
    return {
      citationNumber: String(entry.number),
      documentReference,
      description,
      referencePage: pageLabelFromSource(entry.source),
    };
  });
}

function tableCell(text: string, header: boolean): JSONContent {
  return {
    type: header ? "tableHeader" : "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [
      {
        type: "paragraph",
        content: text.length > 0 ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function tableRow(cells: readonly string[], header: boolean): JSONContent {
  return {
    type: "tableRow",
    content: cells.map((text) => tableCell(text, header)),
  };
}

function citationsTableDoc(rows: readonly ThreeXperCitationRow[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        attrs: { colWidths: [1400, 2800, 3800, 2000] },
        content: [
          tableRow(THREE_XPER_CITATION_HEADERS, true),
          ...rows.map((row) =>
            tableRow(
              [
                row.citationNumber,
                row.documentReference,
                row.description,
                row.referencePage,
              ],
              false
            )
          ),
        ],
      },
    ],
  };
}

export function threeXperCitationsAppendixXml(
  bibliography: readonly ElrBibliographyEntry[],
  options: {
    sections?: readonly ReportSectionRecord[];
    variant?: "qsr" | "vq";
  } = {}
): string {
  if (bibliography.length === 0) return "";
  const rows = threeXperCitationRows(bibliography, options.sections ?? []);
  const runStyle =
    options.variant === "vq" ? VQ_CITATIONS_RUN_STYLE : QSR_CITATIONS_RUN_STYLE;
  const ctx = createDocxExportContext(undefined, runStyle);
  return (
    citationsHeadingParagraphXml(THREE_XPER_CITATIONS_HEADING) +
    narrativeToDocxXml(citationsTableDoc(rows), ctx)
  );
}
