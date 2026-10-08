import type { JSONContent } from "@tiptap/core";
import { citationDisplayFilename } from "@/lib/citations/citation-filename";
import {
  CVP_DOCX_RUN_STYLE,
  QSR_DOCX_RUN_STYLE,
  createDocxExportContext,
  type DocxRunStyle,
} from "@/lib/export/docx-export-context";
import {
  citationSourceIdentityKey,
  citationsHeadingParagraphXml,
  type ElrBibliographyEntry,
  type ReportBibliographyIdentity,
} from "@/lib/export/elr-unified-citations";
import { narrativeToDocxXml } from "@/lib/export/narrative-to-docx-xml";
import {
  canonicalizeSourceCitationBracket,
  parseSourceCitation,
} from "@/lib/placeholders/citation-bracket";
import { orderedCitationSourcesFromContent } from "@/lib/suggestions/citations-at-end";
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

const CVP_DOCUMENT_CATALOG_SECTIONS = [
  "cvp_related_documents",
  "cvp_annexures",
] as const;

const CVP_EQUIPMENT_CATALOG_SECTIONS = [
  "cvp_scope",
  "cvp_background",
  "cvp_qualification_status",
  "cvp_surface_area",
  "cvp_rinse_volume",
  "cvp_maco",
  "cvp_nitrosamine",
  "cvp_pgi",
] as const;

/** Fallback when a QSR table has no recognizable header. */
const CATALOG_NAME_COL = 0;
const CATALOG_NUMBER_COL = 1;

const FILE_EXTENSION = /\.(?:pdf|docx|csv|xlsx)$/i;

/** `1 ` / `24.` / `3)` in front of a protocol title the vault named from a list. */
const LEADING_SERIAL = /^(?:\d+[.)]?\s+)/;

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

/** Whole-filename exhibit ids (`URS/PB2/001`, `DQ-PB2-14`, `ANFD-1302`). */
const DOCUMENT_ID_STEM =
  /^(?:[A-Z]{1,8}(?:[/_-][A-Z0-9]+)+|\d{3,}-\d{4,}[A-Za-z0-9._-]*)$/i;

/**
 * QMS / protocol numbers inside a title (`CVPR-ISM4-26-001-00`). Needs two
 * separators so `Stage-4` / `Table-1` stay in the description.
 */
const MULTI_PART_DOCUMENT_ID =
  /\b[A-Za-z]{1,8}(?:[/_-][A-Za-z0-9]+){2,}\b/g;

/** Equipment tags (`ANFD-1302`, `SSR-1303`, `GLR-1301`). */
const EQUIPMENT_DOCUMENT_ID = /\b[A-Za-z]{2,8}-\d{3,}\b/g;

/** Digit-led QMS ids (`790-00134R`). */
const DIGIT_DOCUMENT_ID = /\b\d{3,}-\d{4,}[A-Za-z0-9._-]*\b/g;

const PLACEHOLDER_DOCUMENT_NUMBER =
  /^(?:n\.?\/?a\.?|nil|none|tbd|n\.a)$/i;

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

type ResolvedCite = {
  source: string;
  documentReference: string;
  description: string;
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
  if (/to be assigned/i.test(trimmed)) return false;
  if (PLACEHOLDER_DOCUMENT_NUMBER.test(trimmed)) return false;
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
        (name) =>
          normalized === name ||
          normalized.startsWith(`${name} `) ||
          normalized.endsWith(` ${name}`) ||
          normalized.includes(` ${name} `)
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

/** Same paper document: exact title, or a short title that is the tail of a longer one. */
function descriptionsAlias(left: string, right: string): boolean {
  const a = normalizeLabel(left);
  const b = normalizeLabel(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 8) return false;
  return (
    longer.endsWith(` ${shorter}`) ||
    longer.startsWith(`${shorter} `) ||
    longer.includes(` ${shorter} `)
  );
}

function findTableNodes(value: unknown): JSONContent[] {
  if (!value || typeof value !== "object") return [];
  const node = value as JSONContent;
  if (node.type === "table") return [node];
  const nested = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  return nested.flatMap((item) => findTableNodes(item));
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

function isNameHeader(label: string): boolean {
  return (
    label === "document name" ||
    label === "name of the document" ||
    label === "sop name" ||
    label === "document title" ||
    label === "name of the equipment" ||
    label === "equipment name"
  );
}

function isNumberHeader(label: string): boolean {
  return (
    label === "document number" ||
    label === "reference number" ||
    label === "sop number" ||
    label === "document no" ||
    label === "document no." ||
    label === "equipment no" ||
    label === "equipment no." ||
    label === "equipment id"
  );
}

function catalogColumnsFromHeader(
  row: readonly string[]
): { nameCol: number; numberCol: number } | null {
  const labels = row.map((cell) => normalizeLabel(cell));
  const nameCol = labels.findIndex(isNameHeader);
  const numberCol = labels.findIndex(isNumberHeader);
  if (nameCol < 0 || numberCol < 0 || nameCol === numberCol) return null;
  return { nameCol, numberCol };
}

function abbreviationColumnsFromHeader(
  row: readonly string[]
): { abbrCol: number; descriptionCol: number } | null {
  const labels = row.map((cell) => normalizeLabel(cell));
  const abbrCol = labels.findIndex((label) => label === "abbreviation");
  const descriptionCol = labels.findIndex((label) => label === "description");
  if (abbrCol < 0 || descriptionCol < 0 || abbrCol === descriptionCol) {
    return null;
  }
  return { abbrCol, descriptionCol };
}

function pushCatalogEntry(
  catalog: QsrDocumentCatalogEntry[],
  seen: Set<string>,
  name: string,
  number: string
): void {
  if (!name || !isUsableDocumentNumber(number)) return;
  const key = `${normalizeLabel(name)}\0${compactId(number)}`;
  if (seen.has(key)) return;
  seen.add(key);
  catalog.push({ name, number });
}

function collectCatalogFromTable(
  table: JSONContent,
  catalog: QsrDocumentCatalogEntry[],
  seen: Set<string>,
  fallbackColumns: { nameCol: number; numberCol: number } | null
): void {
  let columns = fallbackColumns;
  let lastName = "";
  for (const cells of tableGrid(table)) {
    const header = catalogColumnsFromHeader(cells);
    if (header) {
      columns = header;
      continue;
    }
    if (!columns) continue;
    const rawName = (cells[columns.nameCol] ?? "").trim();
    const number = (cells[columns.numberCol] ?? "").trim();
    if (rawName) lastName = rawName;
    pushCatalogEntry(catalog, seen, rawName || lastName, number);
  }
}

/**
 * Document name → number pairs from QSR Table 3, 1.3 References, SOPs, and
 * CVP related-documents / annexures / equipment tables. A blank name under a
 * filled number continues the protocol row above.
 */
export function qsrDocumentReferenceCatalog(
  sections: readonly ReportSectionRecord[]
): QsrDocumentCatalogEntry[] {
  const catalog: QsrDocumentCatalogEntry[] = [];
  const seen = new Set<string>();
  const catalogSection = new Set<string>([
    ...QSR_CATALOG_SECTIONS,
    ...CVP_DOCUMENT_CATALOG_SECTIONS,
    ...CVP_EQUIPMENT_CATALOG_SECTIONS,
  ]);
  for (const row of sections) {
    if (!catalogSection.has(row.section)) continue;
    const isQsr = (QSR_CATALOG_SECTIONS as readonly string[]).includes(
      row.section
    );
    const fallback = isQsr
      ? { nameCol: CATALOG_NAME_COL, numberCol: CATALOG_NUMBER_COL }
      : null;
    for (const table of findTableNodes(row.content)) {
      collectCatalogFromTable(table, catalog, seen, fallback);
    }
  }
  return catalog;
}

function abbreviationCatalog(
  sections: readonly ReportSectionRecord[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of sections) {
    if (row.section !== "cvp_abbreviations") continue;
    for (const table of findTableNodes(row.content)) {
      let columns: { abbrCol: number; descriptionCol: number } | null = null;
      for (const cells of tableGrid(table)) {
        const header = abbreviationColumnsFromHeader(cells);
        if (header) {
          columns = header;
          continue;
        }
        if (!columns) continue;
        const abbr = (cells[columns.abbrCol] ?? "").trim();
        const description = (cells[columns.descriptionCol] ?? "").trim();
        if (!abbr || !description) continue;
        const key = compactId(abbr);
        if (key) map.set(key, description);
      }
    }
  }
  return map;
}

function descriptionFromFilename(filename: string): string {
  const display = citationDisplayFilename(filename);
  const withoutExt = FILE_EXTENSION.test(display)
    ? display.replace(FILE_EXTENSION, "")
    : display;
  return withoutExt.replace(/^\[/, "").replace(/\]$/, "").trim();
}

function tidyDescription(value: string): string {
  return value
    .replace(/[_]+/g, " ")
    .replace(LEADING_SERIAL, "")
    .replace(/\s+/g, " ")
    .trim();
}

function embeddedDocumentIdSpan(
  text: string
): { id: string; start: number; end: number } | null {
  let best: { id: string; start: number; end: number } | null = null;
  const consider = (re: RegExp) => {
    for (const match of text.matchAll(new RegExp(re.source, "g"))) {
      const id = match[0];
      const start = match.index ?? 0;
      if (
        !best ||
        start < best.start ||
        (start === best.start && id.length > best.id.length)
      ) {
        best = { id, start, end: start + id.length };
      }
    }
  };
  consider(MULTI_PART_DOCUMENT_ID);
  consider(EQUIPMENT_DOCUMENT_ID);
  consider(DIGIT_DOCUMENT_ID);
  return best;
}

function splitCiteFilename(filename: string): {
  reference: string;
  description: string;
} {
  const stem = descriptionFromFilename(filename).trim();
  if (!stem) return { reference: "", description: "" };
  if (DOCUMENT_ID_STEM.test(stem)) {
    return { reference: stem, description: "" };
  }
  const span = embeddedDocumentIdSpan(stem);
  if (!span) return { reference: "", description: tidyDescription(stem) };
  const remainder = tidyDescription(
    `${stem.slice(0, span.start)} ${stem.slice(span.end)}`
  );
  return { reference: span.id, description: remainder };
}

function expandedFamilyDescription(stem: string): string | null {
  const normalized = normalizeLabel(stem);
  for (const { abbr, names } of DOCUMENT_FAMILY) {
    if (
      normalized === abbr ||
      normalized.startsWith(`${abbr} `) ||
      compactId(stem).startsWith(abbr)
    ) {
      const phrase = names[0];
      if (!phrase) return null;
      return phrase.replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }
  return null;
}

function letterPrefix(value: string): string {
  const match = /^([A-Za-z]{2,8})(?=[/_-]|$)/.exec(value.trim());
  return match?.[1] ?? "";
}

function expandedAbbreviationDescription(
  reference: string,
  abbreviations: ReadonlyMap<string, string>
): string | null {
  const prefix = letterPrefix(reference);
  if (!prefix) return null;
  return abbreviations.get(compactId(prefix)) ?? null;
}

function catalogMatchScore(query: string, entry: QsrDocumentCatalogEntry): number {
  const q = normalizeLabel(query);
  const n = normalizeLabel(entry.name);
  if (!q || !n) return 0;
  if (q === n) return 400;
  if (compactId(query) && compactId(query) === compactId(entry.number)) {
    return 350;
  }
  if (
    n.endsWith(` ${q}`) ||
    n.startsWith(`${q} `) ||
    n.includes(` ${q} `)
  ) {
    return 200 + Math.min(q.length, 50);
  }
  if (
    q.endsWith(` ${n}`) ||
    q.startsWith(`${n} `) ||
    q.includes(` ${n} `)
  ) {
    return 180 + Math.min(n.length, 50);
  }
  if (labelsMatch(query, entry.name)) return 50;
  return 0;
}

function lookupDocumentNumber(
  filename: string,
  description: string,
  catalog: readonly QsrDocumentCatalogEntry[]
): string {
  const split = splitCiteFilename(filename);
  const ids = [split.reference, descriptionFromFilename(filename)].filter(
    (value, index, all) => value && all.indexOf(value) === index
  );
  for (const id of ids) {
    const stemId = compactId(id);
    for (const entry of catalog) {
      if (stemId && compactId(entry.number) === stemId) return entry.number;
    }
  }
  const queries = [
    description,
    split.description,
    descriptionFromFilename(filename),
  ].filter((value, index, all) => value && all.indexOf(value) === index);
  let best: { number: string; score: number } | null = null;
  for (const query of queries) {
    for (const entry of catalog) {
      const score = catalogMatchScore(query, entry);
      if (score === 0) continue;
      if (!best || score > best.score) best = { number: entry.number, score };
    }
  }
  return best?.number ?? split.reference;
}

function resolveCitationColumns(
  filename: string,
  catalog: readonly QsrDocumentCatalogEntry[],
  abbreviations: ReadonlyMap<string, string>
): { documentReference: string; description: string } {
  const split = splitCiteFilename(filename);
  let description = split.description;
  const documentReference = lookupDocumentNumber(
    filename,
    description,
    catalog
  );
  const usableReference = isUsableDocumentNumber(documentReference)
    ? documentReference
    : "";
  const catalogEntry = usableReference
    ? catalog.find(
        (entry) => compactId(entry.number) === compactId(usableReference)
      )
    : undefined;
  const catalogName = catalogEntry?.name;
  const descriptionIsReference =
    !description ||
    (usableReference.length > 0 &&
      normalizeLabel(description) === normalizeLabel(usableReference));
  if (descriptionIsReference) {
    description =
      catalogName ??
      expandedFamilyDescription(usableReference || description) ??
      expandedAbbreviationDescription(usableReference, abbreviations) ??
      "";
  } else if (
    catalogName &&
    descriptionsAlias(description, catalogName) &&
    catalogName.length > description.length
  ) {
    description = catalogName;
  }
  if (!description) {
    description =
      catalogName ??
      expandedFamilyDescription(usableReference) ??
      expandedAbbreviationDescription(usableReference, abbreviations) ??
      "";
  }
  return {
    documentReference: usableReference,
    description: tidyDescription(description),
  };
}

function pagesFromSource(source: string): number[] {
  const parsed = parseSourceCitation(source);
  if (!parsed || parsed.pages.length === 0) return [];
  const inner = source.trim().replace(/^\[/, "").replace(/\]$/, "");
  const suffix = /,\s*p\.\s*(.+)$/i.exec(inner);
  if (!suffix) {
    return [...new Set(parsed.pages)].toSorted((a, b) => a - b);
  }
  const tokens = suffix[1]
    .replace(/\s*,\s*p\.\s*/gi, ", ")
    .split(/\s*,\s*/);
  const pages: number[] = [];
  const seen = new Set<number>();
  const add = (n: number) => {
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) return;
    seen.add(n);
    pages.push(n);
  };
  for (const token of tokens) {
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(token.trim());
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      if (hi - lo > 50) {
        add(lo);
        add(hi);
        continue;
      }
      for (let n = lo; n <= hi; n++) add(n);
      continue;
    }
    add(Number(token.trim()));
  }
  return pages.toSorted((a, b) => a - b);
}

function compactPageList(pages: readonly number[]): string {
  if (pages.length === 0) return "";
  const sorted = [...pages].toSorted((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]!;
  let end = start;
  const flush = () => {
    parts.push(start === end ? String(start) : `${start}-${end}`);
  };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n === end + 1) {
      end = n;
      continue;
    }
    flush();
    start = end = n;
  }
  flush();
  return parts.join(", ");
}

function pageLabelFromSource(source: string): string {
  const pages = compactPageList(pagesFromSource(source));
  return pages ? `Page # ${pages}` : "";
}

function sourceFilename(source: string): string {
  const parsed = parseSourceCitation(source);
  if (parsed?.filename.trim()) return parsed.filename.trim();
  return source
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/,\s*p\.\s*.+$/i, "")
    .trim();
}

function filenameSpecificity(filename: string): number {
  const split = splitCiteFilename(filename);
  return (split.reference ? 1000 : 0) + tidyDescription(split.description || filename).length;
}

function rewriteSourcePages(filename: string, pages: readonly number[]): string {
  const stem = filename.trim();
  if (!stem) return "";
  const list = compactPageList(pages);
  return list ? `[${stem}, p. ${list}]` : `[${stem}]`;
}

/**
 * Keep the more specific filename and union page lists so one bibliography
 * row can carry `Page # 1-5`.
 */
export function mergeThreeXperCitationSources(
  kept: string,
  incoming: string
): string {
  const keptFile = sourceFilename(kept);
  const incomingFile = sourceFilename(incoming);
  const filename =
    filenameSpecificity(incomingFile) > filenameSpecificity(keptFile)
      ? incomingFile
      : keptFile;
  const pages = [
    ...new Set([...pagesFromSource(kept), ...pagesFromSource(incoming)]),
  ].toSorted((a, b) => a - b);
  return rewriteSourcePages(filename || keptFile || incomingFile, pages);
}

function resolvedCiteFromSource(
  source: string,
  catalog: readonly QsrDocumentCatalogEntry[],
  abbreviations: ReadonlyMap<string, string>
): ResolvedCite {
  const parsed = parseSourceCitation(source);
  const filename = parsed?.filename?.trim() || source;
  const columns = resolveCitationColumns(filename, catalog, abbreviations);
  return { source, ...columns };
}

function citationRowsAlias(left: ResolvedCite, right: ResolvedCite): boolean {
  const leftRef = compactId(left.documentReference);
  const rightRef = compactId(right.documentReference);
  if (leftRef && rightRef) return leftRef === rightRef;
  if (leftRef || rightRef) {
    return descriptionsAlias(left.description, right.description);
  }
  return descriptionsAlias(left.description, right.description);
}

function groupKeyForCite(cite: ResolvedCite): string {
  if (cite.documentReference && isUsableDocumentNumber(cite.documentReference)) {
    return `ref:${compactId(cite.documentReference)}`;
  }
  const description = normalizeLabel(cite.description);
  if (description) return `desc:${description}`;
  return citationSourceIdentityKey(cite.source).replace(/\0.*$/, "");
}

function uniqueSectionSources(
  sections: readonly ReportSectionRecord[]
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const row of sections) {
    for (const source of orderedCitationSourcesFromContent(row.content)) {
      const canonical = canonicalizeSourceCitationBracket(source);
      const key = canonical || source;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      ordered.push(source);
    }
  }
  return ordered;
}

/**
 * Same catalog document (or aliased title) is one bibliography row, even
 * when cited on different pages. Page lists are merged separately.
 */
export function threeXperBibliographyIdentity(
  sections: readonly ReportSectionRecord[] = []
): ReportBibliographyIdentity {
  const catalog = qsrDocumentReferenceCatalog(sections);
  const abbreviations = abbreviationCatalog(sections);
  const sources = uniqueSectionSources(sections);
  const resolved = sources.map((source) =>
    resolvedCiteFromSource(source, catalog, abbreviations)
  );
  const parent = resolved.map((_, i) => i);
  const find = (i: number): number => {
    let cursor = i;
    while (parent[cursor] !== cursor) {
      parent[cursor] = parent[parent[cursor]!]!;
      cursor = parent[cursor]!;
    }
    return cursor;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (citationRowsAlias(resolved[i]!, resolved[j]!)) union(i, j);
    }
  }
  const keyByRoot = new Map<number, string>();
  for (let i = 0; i < resolved.length; i++) {
    const root = find(i);
    if (keyByRoot.has(root)) continue;
    const members = resolved.filter((_, index) => find(index) === root);
    const withRef = members.find((member) =>
      isUsableDocumentNumber(member.documentReference)
    );
    const longest = members.toSorted(
      (a, b) => b.description.length - a.description.length
    )[0]!;
    keyByRoot.set(root, groupKeyForCite(withRef ?? longest));
  }
  const bySource = new Map<string, string>();
  for (let i = 0; i < sources.length; i++) {
    const key = keyByRoot.get(find(i)) ?? groupKeyForCite(resolved[i]!);
    bySource.set(sources[i]!, key);
    bySource.set(canonicalizeSourceCitationBracket(sources[i]!), key);
  }
  return (source: string) => {
    const mapped =
      bySource.get(source) ??
      bySource.get(canonicalizeSourceCitationBracket(source));
    if (mapped) return mapped;
    return groupKeyForCite(
      resolvedCiteFromSource(source, catalog, abbreviations)
    );
  };
}

/**
 * Collapse equivalent 3xper cites onto one document (catalog number, or
 * aliased description). Different pages of that document share the key so
 * Word CITATIONS can list them once with a combined Reference page#.
 */
export function threeXperCitationIdentityKey(
  source: string,
  sections: readonly ReportSectionRecord[] = []
): string {
  return threeXperBibliographyIdentity(sections)(source);
}

export function threeXperCitationRows(
  bibliography: readonly ElrBibliographyEntry[],
  sections: readonly ReportSectionRecord[] = []
): ThreeXperCitationRow[] {
  const catalog = qsrDocumentReferenceCatalog(sections);
  const abbreviations = abbreviationCatalog(sections);
  return bibliography.map((entry) => {
    const parsed = parseSourceCitation(entry.source);
    const filename = parsed?.filename?.trim() || entry.source;
    const { documentReference, description } = resolveCitationColumns(
      filename,
      catalog,
      abbreviations
    );
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
        attrs: { colWidths: [1200, 2600, 4200, 2000] },
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

function citationsBodyHeadingXml(text: string): string {
  return (
    `<w:p>` +
    `<w:pPr>` +
    `<w:pStyle w:val="BodyText"/>` +
    `<w:outlineLvl w:val="9"/>` +
    `<w:spacing w:before="200" w:line="360" w:lineRule="auto"/>` +
    `</w:pPr>` +
    `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>` +
    `<w:t xml:space="preserve">${text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</w:t></w:r>` +
    `</w:p>`
  );
}

export function threeXperCitationsAppendixXml(
  bibliography: readonly ElrBibliographyEntry[],
  options: {
    sections?: readonly ReportSectionRecord[];
    variant?: "qsr" | "vq" | "cvp";
  } = {}
): string {
  if (bibliography.length === 0) return "";
  const rows = threeXperCitationRows(bibliography, options.sections ?? []);
  const runStyle =
    options.variant === "vq"
      ? VQ_CITATIONS_RUN_STYLE
      : options.variant === "cvp"
        ? CVP_DOCX_RUN_STYLE
        : QSR_CITATIONS_RUN_STYLE;
  const ctx = createDocxExportContext(undefined, runStyle);
  const heading =
    options.variant === "cvp"
      ? citationsBodyHeadingXml(THREE_XPER_CITATIONS_HEADING)
      : citationsHeadingParagraphXml(THREE_XPER_CITATIONS_HEADING);
  return heading + narrativeToDocxXml(citationsTableDoc(rows), ctx);
}
