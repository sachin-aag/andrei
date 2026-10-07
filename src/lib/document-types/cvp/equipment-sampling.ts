import type { JSONContent } from "@tiptap/core";
import { compact3xperLitreVolumesInDoc } from "@/lib/document-types/3xper-volume-style";
import { emptyDoc, normalizeRichField } from "@/lib/tiptap/rich-text";
import {
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_EQUIPMENT_DOCUMENTS_HEADERS,
  CVP_EQUIPMENT_IDENTITY_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_SHELL_CALC_HEADERS,
  CVP_SWAB_LOCATION_HEADERS,
  CVP_SWAB_RATIONALE_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  cvpEquipmentSamplingSeed,
  isStockEquipmentInstruction,
  upgradeCvpEquipmentSamplingNarrative,
} from "@/lib/document-types/cvp/sections";
import {
  cvpEquipmentItemIndex,
  cvpEquipmentItemIndexFromTarget,
  isCvpEquipmentItemField,
} from "@/lib/document-types/cvp/equipment-item-path";

export {
  cvpEquipmentItemIndex,
  cvpEquipmentItemIndexFromTarget,
  isCvpEquipmentItemField,
};

export const CVP_EQUIPMENT_FIELD_PATTERN = "items.[]";
export const CVP_EQUIPMENT_SAMPLING_SECTION = "cvp_equipment_sampling";

export type CvpEquipmentSamplingContent = { items: JSONContent[] };

const EQUIPMENT_TABLE_HEADERS: readonly (readonly string[])[] = [
  CVP_EQUIPMENT_IDENTITY_HEADERS,
  CVP_EQUIPMENT_DOCUMENTS_HEADERS,
  CVP_SWAB_LOCATION_HEADERS,
  CVP_SHELL_CALC_HEADERS,
  CVP_SWAB_RATIONALE_HEADERS,
  CVP_CLEANING_OPERATION_HEADERS,
  CVP_VISUAL_INSPECTION_HEADERS,
  CVP_RESIDUE_RESULTS_HEADERS,
  CVP_EXTRANEOUS_RESULTS_HEADERS,
];

const HEADING_ORDINAL_RE = /^(15\.(?:N|\d+))/;

/** Pad missing `items.N` with the 15.N seed so apply does not merge against emptyDoc(). */
export function ensureCvpEquipmentFieldContent(
  content: Record<string, unknown>,
  targetField: string
): Record<string, unknown> {
  const index = cvpEquipmentItemIndexFromTarget(targetField);
  if (index == null) return content;
  return ensureCvpEquipmentItem(content, index);
}

export function cvpEquipmentItemAnchor(index: number): string {
  return `${CVP_EQUIPMENT_SAMPLING_SECTION}-item-${index}`;
}

function nodePlain(node: JSONContent | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodePlain).join("");
}

function headingText(node: JSONContent): string {
  return nodePlain(node).replace(/\s+/g, " ").trim();
}

function nodeHasSuggestionMarks(node: JSONContent): boolean {
  if (
    (node.marks ?? []).some(
      (mark) =>
        mark.type === "suggestionInsert" || mark.type === "suggestionDelete"
    )
  ) {
    return true;
  }
  return (node.content ?? []).some(nodeHasSuggestionMarks);
}

function retitleHeadingText(text: string, ordinal: number): string | null {
  const match = HEADING_ORDINAL_RE.exec(text);
  if (!match) return null;
  const next = `15.${ordinal}${text.slice(match[1]!.length)}`;
  return next === text ? null : next;
}

function rowCells(row: JSONContent): string[] {
  return (row.content ?? [])
    .filter((cell) => cell.type === "tableHeader" || cell.type === "tableCell")
    .map((cell) => nodePlain(cell).replace(/\s+/g, " ").trim());
}

function rowMatchesHeader(
  cells: readonly string[],
  header: readonly string[]
): boolean {
  if (cells.length < header.length) return false;
  return header.every(
    (label, i) => (cells[i] ?? "").toLowerCase() === label.toLowerCase()
  );
}

function asHeaderRow(row: JSONContent): JSONContent {
  return {
    ...row,
    type: "tableRow",
    content: (row.content ?? []).map((cell) =>
      cell.type === "tableHeader" ? cell : { ...cell, type: "tableHeader" }
    ),
  };
}

/**
 * Apply All of a multi-table draft_field dump pastes every GFM grid into the
 * first identity table (Documents / Location ID / … appear as data rows).
 * Split those header-rows back into their own tables.
 */
export function splitWarpedCvpEquipmentTables(doc: JSONContent): JSONContent {
  const next: JSONContent[] = [];
  for (const node of doc.content ?? []) {
    if (node.type !== "table") {
      next.push(node);
      continue;
    }
    const rows = node.content ?? [];
    if (rows.length === 0) {
      next.push(node);
      continue;
    }
    const chunks: JSONContent[][] = [];
    let current = [rows[0]!];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]!;
      const cells = rowCells(row);
      const matched = EQUIPMENT_TABLE_HEADERS.find((header) =>
        rowMatchesHeader(cells, header)
      );
      const currentHeader = rowCells(current[0]!);
      if (
        matched &&
        !rowMatchesHeader(currentHeader, matched)
      ) {
        chunks.push(current);
        current = [asHeaderRow(row)];
        continue;
      }
      current.push(row);
    }
    chunks.push(current);
    for (const chunk of chunks) {
      next.push({ type: "table", content: chunk });
    }
  }
  return { type: "doc", content: next };
}

const PLACEHOLDER_H2_RE = /equipment name\s*\(\s*equipment no\.?\s*\)/i;
const HEADING_PREFIX_RE = /^15\.(?:N|\d+)(?:\.\d+)*\s*/i;

const SEED_TABLE_BY_HEADER = (() => {
  const map = new Map<string, JSONContent>();
  for (const node of cvpEquipmentSamplingSeed(1).content ?? []) {
    if (node.type !== "table") continue;
    const key = tableHeaderKey(node);
    if (key && !map.has(key)) map.set(key, node);
  }
  return map;
})();

function tableHeaderKey(table: JSONContent): string {
  const header = table.content?.[0];
  if (!header) return "";
  return rowCells(header).join("|").toLowerCase();
}

function tableCellGrid(table: JSONContent): string[][] {
  return (table.content ?? []).map((row) => rowCells(row));
}

function isScaffoldTable(table: JSONContent): boolean {
  const key = tableHeaderKey(table);
  const live = tableCellGrid(table);
  const seed = key ? SEED_TABLE_BY_HEADER.get(key) : undefined;
  if (!seed) {
    return live.slice(1).every((row) => row.every((cell) => cell.length === 0));
  }
  const seedGrid = tableCellGrid(seed);
  for (let r = 0; r < live.length; r++) {
    const liveRow = live[r] ?? [];
    const seedRow = seedGrid[r] ?? [];
    for (let c = 0; c < Math.max(liveRow.length, seedRow.length); c++) {
      const liveCell = (liveRow[c] ?? "").trim();
      const seedCell = (seedRow[c] ?? "").trim();
      if (liveCell && liveCell !== seedCell) return false;
    }
  }
  return true;
}

function canonicalHeadingKey(text: string): string {
  return text.replace(HEADING_PREFIX_RE, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isPlaceholderEquipmentTitle(text: string): boolean {
  return PLACEHOLDER_H2_RE.test(text);
}

const OUTLINE_PARAGRAPH_RE = /^15\.(?:N|\d+)((?:\.\d+){0,2})\s+[A-Za-z(]/i;
const OUTLINE_TITLE_MAX = 120;

/**
 * Bold "15.N.M Title" paragraphs (heading nodes flattened by an older apply
 * path) become H2/H3/H4 again so retitling and the 15.N split can see them.
 */
function promoteOutlineParagraph(node: JSONContent): JSONContent {
  if (node.type !== "paragraph" || nodeHasSuggestionMarks(node)) return node;
  if ((node.content ?? []).some((child) => child.type !== "text")) return node;
  const text = headingText(node);
  if (text.length > OUTLINE_TITLE_MAX || /[.:;]$/.test(text)) return node;
  const match = OUTLINE_PARAGRAPH_RE.exec(text);
  if (!match) return node;
  const depth = match[1] ? match[1].split(".").length - 1 : 0;
  return headingNode(2 + depth, text);
}

function headingNode(level: number, text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function replaceLastTableWithKey(
  out: JSONContent[],
  key: string,
  table: JSONContent
): boolean {
  for (let i = out.length - 1; i >= 0; i--) {
    const node = out[i]!;
    if (node.type === "table" && tableHeaderKey(node) === key) {
      out[i] = table;
      return true;
    }
  }
  return false;
}

function shouldStripStockInstructions(doc: JSONContent): boolean {
  const content = doc.content ?? [];
  let h2Count = 0;
  const headingKeys = new Set<string>();
  for (const node of content) {
    if (node.type === "heading") {
      if (Number(node.attrs?.level) === 2) h2Count += 1;
      const key = canonicalHeadingKey(headingText(node));
      if (key && headingKeys.has(key) && Number(node.attrs?.level) !== 2) {
        return true;
      }
      if (key) headingKeys.add(key);
    }
    if (node.type === "table" && !isScaffoldTable(node)) return true;
  }
  return h2Count > 1;
}

/**
 * Drop stacked copies of the 15.1 outline (Agent append after a refused
 * draft_field) and engineer-facing seed instructions once the box is filled.
 * Keep the first filled table of each header and a single H2 — prefer a
 * real equipment title over "Equipment name (Equipment No.)".
 */
export function collapseCvpEquipmentItem(doc: JSONContent): JSONContent {
  const stripStock = shouldStripStockInstructions(doc);
  const out: JSONContent[] = [];
  const seenHeadings = new Set<string>();
  const seenParagraphs = new Set<string>();
  const tableState = new Map<string, "scaffold" | "filled">();
  let h2Index = -1;
  let afterExtraH2 = false;
  let introInsertAt = 0;
  let lastLabel = "";

  for (const raw of doc.content ?? []) {
    const node = promoteOutlineParagraph(raw);
    if (node.type === "heading") {
      const text = headingText(node);
      const level = Number(node.attrs?.level);
      if (level === 2) {
        if (h2Index >= 0) {
          const current = headingText(out[h2Index]!);
          if (
            isPlaceholderEquipmentTitle(current) &&
            text &&
            !isPlaceholderEquipmentTitle(text)
          ) {
            out[h2Index] = node;
          }
          afterExtraH2 = true;
          introInsertAt = h2Index + 1;
          lastLabel = "h2";
          continue;
        }
        h2Index = out.length;
        out.push(node);
        afterExtraH2 = false;
        lastLabel = "h2";
        continue;
      }
      afterExtraH2 = false;
      const key = canonicalHeadingKey(text);
      if (!key || seenHeadings.has(key)) continue;
      seenHeadings.add(key);
      lastLabel = key;
      out.push(node);
      continue;
    }
    if (node.type === "table") {
      afterExtraH2 = false;
      const key = tableHeaderKey(node) || `anon-${out.length}`;
      const scaffold = isScaffoldTable(node);
      const prev = tableState.get(key);
      if (prev === "filled") continue;
      if (prev === "scaffold") {
        if (scaffold) continue;
        replaceLastTableWithKey(out, key, node);
        tableState.set(key, "filled");
        continue;
      }
      tableState.set(key, scaffold ? "scaffold" : "filled");
      out.push(node);
      continue;
    }
    const text = nodePlain(node).replace(/\s+/g, " ").trim();
    if (!text) {
      out.push(node);
      continue;
    }
    if (stripStock && isStockEquipmentInstruction(text)) continue;
    if (/^inference:/i.test(text)) lastLabel = "inference";
    else if (/^conclusion:/i.test(text)) lastLabel = "conclusion";
    else if (/^citations?:/i.test(text)) lastLabel = "citations";
    const paraKey = `${lastLabel}::${text.toLowerCase()}`;
    if (seenParagraphs.has(paraKey)) continue;
    seenParagraphs.add(paraKey);
    if (afterExtraH2) {
      out.splice(introInsertAt, 0, node);
      introInsertAt += 1;
      continue;
    }
    out.push(node);
  }

  return { type: "doc", content: out.length > 0 ? out : [{ type: "paragraph" }] };
}

export function splitCvpEquipmentDocIntoItems(doc: JSONContent): JSONContent[] {
  const groups: JSONContent[][] = [];
  let current: JSONContent[] = [];
  for (const node of doc.content ?? []) {
    const isH2 =
      node.type === "heading" && Number(node.attrs?.level) === 2 && current.length > 0;
    if (isH2) {
      groups.push(current);
      current = [node];
      continue;
    }
    current.push(node);
  }
  if (current.length > 0) groups.push(current);
  if (groups.length === 0) return [emptyDoc()];
  return groups.map((content) => ({ type: "doc" as const, content }));
}

export function retitleCvpEquipmentDoc(
  doc: JSONContent,
  ordinal: number
): JSONContent {
  return {
    type: "doc",
    content: (doc.content ?? []).map((node) => {
      if (node.type !== "heading") return node;
      // Rewriting the heading node would flatten pending insert/delete marks
      // and desync propose_edit anchors (15.N → 15.1) so Apply cannot locate.
      if (nodeHasSuggestionMarks(node)) return node;
      const text = headingText(node);
      if (!text) return node;
      const nextText =
        retitleHeadingText(text, ordinal) ??
        (Number(node.attrs?.level) === 2 && !HEADING_ORDINAL_RE.test(text)
          ? `15.${ordinal} ${text}`
          : null);
      if (!nextText) return node;
      return {
        ...node,
        content: [{ type: "text", text: nextText }],
      };
    }),
  };
}

export function cvpEquipmentItemTitle(doc: JSONContent, ordinal: number): string {
  const h2 = (doc.content ?? []).find(
    (node) => node.type === "heading" && Number(node.attrs?.level) === 2
  );
  const text = h2 ? headingText(h2) : "";
  return text || `15.${ordinal} Equipment name (Equipment No.)`;
}

function normalizeItem(doc: JSONContent): JSONContent {
  // Do not graft the 15.1 seed onto an items[] box — that put Duplicate-this-box
  // and empty outline headings back after the engineer deleted them (upgrade
  // still runs on legacy `narrative` in docsFromRaw).
  return compact3xperLitreVolumesInDoc(
    collapseCvpEquipmentItem(
      splitWarpedCvpEquipmentTables(
        normalizeRichField(doc, { preserveHeadings: true })
      )
    )
  );
}

function docsFromRaw(raw: unknown): JSONContent[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [cvpEquipmentSamplingSeed(1)];
  }
  const rec = raw as Record<string, unknown>;
  if (Array.isArray(rec.items)) {
    const items = rec.items
      .filter((item) => item && typeof item === "object")
      .map((item) => item as JSONContent);
    return items.length > 0 ? items : [emptyDoc()];
  }
  if (Object.prototype.hasOwnProperty.call(rec, "narrative")) {
    const narrative = upgradeCvpEquipmentSamplingNarrative(
      normalizeRichField(rec.narrative, { preserveHeadings: true })
    );
    return splitCvpEquipmentDocIntoItems(splitWarpedCvpEquipmentTables(narrative));
  }
  // Missing both keys = never written (new report uses emptyContent with items).
  // Do not treat a wiped `{}` as a reason to put the seed back.
  return [emptyDoc()];
}

export function normalizeCvpEquipmentSamplingContent(
  raw: unknown
): CvpEquipmentSamplingContent {
  const docs = docsFromRaw(raw).map((doc, i) =>
    retitleCvpEquipmentDoc(normalizeItem(doc), i + 1)
  );
  return { items: docs.length > 0 ? docs : [emptyDoc()] };
}

export function concatCvpEquipmentItems(content: unknown): JSONContent {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  return {
    type: "doc",
    content: items.flatMap((item) => item.content ?? []),
  };
}

/** Insert a blank 15.N seed after `afterIndex`. Never copies filled tables. */
export function insertBlankCvpEquipmentItem(
  items: JSONContent[],
  afterIndex: number
): JSONContent[] {
  const at = Math.max(0, Math.min(afterIndex + 1, items.length));
  const next = [
    ...items.slice(0, at),
    cvpEquipmentSamplingSeed(at + 1),
    ...items.slice(at),
  ];
  return next.map((doc, index) => retitleCvpEquipmentDoc(doc, index + 1));
}

export function appendCvpEquipmentItem(items: JSONContent[]): JSONContent[] {
  return insertBlankCvpEquipmentItem(items, items.length - 1);
}

export function removeCvpEquipmentItem(
  items: JSONContent[],
  index: number
): JSONContent[] {
  if (items.length <= 1) return items;
  const next = items.filter((_, i) => i !== index);
  return next.map((doc, i) => retitleCvpEquipmentDoc(doc, i + 1));
}

export function ensureCvpEquipmentItem(
  content: Record<string, unknown>,
  index: number
): CvpEquipmentSamplingContent {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  while (items.length <= index) {
    items.push(cvpEquipmentSamplingSeed(items.length + 1));
  }
  return {
    items: items.map((doc, i) => retitleCvpEquipmentDoc(doc, i + 1)),
  };
}

/** Replace the H2 title on a seeded item; keep the outline tables. */
export function applyCvpEquipmentHeadingMarkdown(
  item: JSONContent,
  markdown: string,
  ordinal: number
): JSONContent {
  const titleLine = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .find((line) => line.length > 0);
  if (!titleLine) return retitleCvpEquipmentDoc(item, ordinal);
  const titled: JSONContent = {
    type: "doc",
    content: (item.content ?? []).map((node) => {
      if (node.type === "heading" && Number(node.attrs?.level) === 2) {
        return {
          ...node,
          content: [{ type: "text", text: titleLine }],
        };
      }
      return node;
    }),
  };
  return retitleCvpEquipmentDoc(titled, ordinal);
}

export function cvpEquipmentTocChildren(content: unknown): Array<{
  label: string;
  sectionKey: typeof CVP_EQUIPMENT_SAMPLING_SECTION;
  jumpId: string;
}> {
  const { items } = normalizeCvpEquipmentSamplingContent(content);
  return items.map((doc, index) => ({
    label: cvpEquipmentItemTitle(doc, index + 1),
    sectionKey: CVP_EQUIPMENT_SAMPLING_SECTION,
    jumpId: cvpEquipmentItemAnchor(index),
  }));
}
